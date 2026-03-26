# Architecture Patterns: V2X Discharge in CitrineOS

**Domain:** OCPP 2.1 V2X Discharge CSMS Integration
**Researched:** 2026-03-26
**Confidence:** HIGH (based on direct codebase analysis)

## Executive Summary

V2X discharge support maps naturally onto CitrineOS's existing three-module split: **Transactions** (transaction lifecycle and meter values), **SmartCharging** (charging needs, profiles, energy transfer negotiation), and **EVDriver** (CSMS-initiated start/stop and authorization responses). No new modules are needed. The gaps are within existing modules: missing OCPP 2.1-specific handlers (currently only 2.0.1 handlers exist for TransactionEvent and MeterValues), missing V2X/BPT energy transfer mode support in SmartCharging's profile calculator, missing Export measurand handling in `MeterValueUtils`, and the completely unimplemented `NotifyAllowedEnergyTransfer` CSMS-to-CS message.

## Recommended Architecture

### Principle: Extend, Do Not Restructure

CitrineOS's module architecture already maps well to V2X discharge. Every OCPP message involved in the V2X discharge flow already has a target module via the `EventGroup` routing and config-driven `requests`/`responses` arrays. The work is filling in handler implementations and data model awareness, not creating new architectural components.

### V2X Discharge Message Flow

```
Charging Station                    CitrineOS CSMS
     |                                    |
     |--- BootNotification ------------->| Configuration module (existing, works)
     |<-- BootNotificationResponse ------|
     |                                    |
     |--- Authorize -------------------->| EVDriver module (existing, 2.0.1 handler works for 2.1 basic flow)
     |<-- AuthorizeResponse -------------|
     |                                    |
     |--- TransactionEvent(Started) ---->| Transactions module (GAP: no 2.1-specific handler)
     |<-- TransactionEventResponse ------|   - operationMode field in TransactionType is new in 2.1
     |                                    |
     |--- NotifyEVChargingNeeds -------->| SmartCharging module (GAP: BPT/V2X modes not handled)
     |<-- NotifyEVChargingNeedsResp ----|   - v2xChargingParameters ignored
     |                                    |   - AC_BPT/DC_BPT requestedEnergyTransfer throws error
     |<-- NotifyAllowedEnergyTransfer ---| EVDriver module (GAP: not implemented at all)
     |--> NotifyAllowedEnergyTransferResp|
     |                                    |
     |<-- SetChargingProfile ------------|  SmartCharging module (existing, works for setting profiles)
     |--> SetChargingProfileResponse ----|
     |                                    |
     |--- TransactionEvent(Updated) ---->| Transactions module (GAP: export measurands ignored)
     |    (with V2X meter values)         |   - MeterValueUtils only reads Import, not Export
     |<-- TransactionEventResponse ------|
     |                                    |
     |--- MeterValues ------------------>| Transactions module (GAP: same Export measurand issue)
     |<-- MeterValuesResponse -----------|
     |                                    |
     |--- TransactionEvent(Ended) ------>| Transactions module
     |<-- TransactionEventResponse ------|
```

### Component Boundaries

| Component | Responsibility | V2X Change Needed |
|-----------|---------------|-------------------|
| **OcppRouter** | WebSocket + message routing to modules via RabbitMQ | None -- already routes all actions, including 2.1-only actions like `NotifyAllowedEnergyTransfer` |
| **Transactions Module** | TransactionEvent, MeterValues, StatusNotification, CostUpdated handlers | OCPP 2.1-specific TransactionEvent handler (operationMode, costDetails); Export measurand support in MeterValueUtils |
| **SmartCharging Module** | NotifyEVChargingNeeds, ChargingProfile management, NotifyEVChargingSchedule | BPT/V2X energy transfer modes in `calculateChargingProfile`; V2XChargingParametersType support |
| **EVDriver Module** | Authorize, RequestStartTransaction/Stop, NotifyAllowedEnergyTransfer | New `NotifyAllowedEnergyTransfer` MessageApi endpoint + response handler |
| **00_Base** | OCPP types, MeterValueUtils, config schema | Export measurand handling in MeterValueUtils; types already exist |
| **01_Data** | Transaction model, repositories | Transaction model may need `operationMode` column |
| **Configuration Module** | BootNotification, Heartbeat | None -- already handles 2.1 boot |

## Module-Level Gap Analysis

### 1. Transactions Module (`03_Modules/Transactions/src/module/module.ts`)

**Existing handlers:**
- `@AsHandler([OCPPVersion.OCPP2_0_1], OCPP_CallAction.TransactionEvent)` -- handles 2.0.1 only
- `@AsHandler([OCPPVersion.OCPP2_0_1], OCPP_CallAction.MeterValues)` -- handles 2.0.1 only
- `@AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.StatusNotification)` -- handles both 2.0.1 and 2.1
- `@AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.CostUpdated)` -- handles both
- `@AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.GetTransactionStatus)` -- handles both

**Source code TODOs (line 429, 502):**
```
//TODO: Need a transaction event handler for OCPP 2.1 as we need to tweak or extend the transaction service for ocpp 2.1
//TODO: Need a meter event handler for OCPP 2.1 as we need to tweak or extend the transaction service for ocpp 2.1
```

**Required handler additions:**

| Handler | Decorator | V2X-Specific Logic |
|---------|-----------|-------------------|
| `_handleTransactionEvent21` | `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.TransactionEvent)` | Process `operationMode` field from `TransactionType`; handle `costDetails` in request; handle negative energy in totalKwh calculation |
| `_handleMeterValues21` | `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.MeterValues)` | Process Export measurands; handle bidirectional energy accounting |

**Why separate 2.1 handlers are needed:**
- OCPP 2.1 `TransactionEventRequest` adds `costDetails` (full `CostDetailsType`), `evseSleep`, and `TransactionType` now includes `operationMode` (Idle, ChargingOnly, CentralSetpoint, ExternalSetpoint, etc.) and `tariffId`
- OCPP 2.1 `MeterValuesRequest` can include Export measurands that 2.0.1 did not have
- The existing 2.0.1 handler uses `OCPP2_0_1.TransactionEventRequest` type -- 2.1 has different fields

### 2. SmartCharging Module (`03_Modules/SmartCharging/src/module/module.ts`)

**Existing handler:**
- `@AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.NotifyEVChargingNeeds)` -- already handles both 2.0.1 and 2.1

**Current limitation in `InternalSmartCharging.calculateChargingProfile()`:**
```typescript
switch (transferMode) {
  case OCPP2_0_1.EnergyTransferModeEnumType.AC_single_phase:
  case OCPP2_0_1.EnergyTransferModeEnumType.AC_two_phase:
  case OCPP2_0_1.EnergyTransferModeEnumType.AC_three_phase:
    // handles AC params
    break;
  case OCPP2_0_1.EnergyTransferModeEnumType.DC:
    // handles DC params
    break;
  default:
    throw new Error('Unsupported energy transfer mode');  // <-- V2X BPT modes land here
}
```

**V2X BPT energy transfer modes that need support:**
- `AC_BPT` -- AC bidirectional power transfer
- `DC_BPT` -- DC bidirectional power transfer
- `AC_BPT_DER` -- AC BPT with DER
- `DC_ACDP_BPT` -- DC ACDP BPT

**Another gap in NotifyEVChargingNeeds handler (line 197-205):**
```typescript
const hasAcOrDcChargingParameters =
  givenNeeds.dcChargingParameters !== null || givenNeeds.acChargingParameters !== null;
// ^^ Does not check v2xChargingParameters!
```

The handler rejects requests that only have `v2xChargingParameters` (no AC or DC params).

**Required changes:**

| Change | Location | Description |
|--------|----------|-------------|
| Add BPT cases to switch | `InternalSmartCharging.calculateChargingProfile()` | Handle `AC_BPT`, `DC_BPT`, `AC_BPT_DER`, `DC_ACDP_BPT` using `v2xChargingParameters` |
| Update parameter check | `SmartChargingModule._handleNotifyEVChargingNeeds()` | Include `v2xChargingParameters` in the `hasAcOrDcChargingParameters` check |
| Add `matchedChargingType` for BPT | `SmartChargingModule._handleNotifyEVChargingNeeds()` | Match BPT modes with v2xChargingParameters |
| Handle discharge limits | `InternalSmartCharging.calculateChargingProfile()` | Use `maxDischargePower`/`minDischargePower` from V2XChargingParametersType to generate bidirectional profiles |

### 3. EVDriver Module (`03_Modules/EVDriver/src/module/module.ts`)

**Existing handlers working for V2X:**
- `@AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.RequestStartTransaction)` -- response handler, works for 2.1
- `@AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.RequestStopTransaction)` -- response handler, works for 2.1
- `@AsHandler([OCPPVersion.OCPP2_0_1], OCPP_CallAction.Authorize)` -- 2.0.1 only, may need 2.1 variant

**Missing:**
- `NotifyAllowedEnergyTransfer` -- a CSMS-to-CS message (outbound). The CSMS sends this to tell the charging station which energy transfer modes (including BPT/V2X) are allowed for a given transaction. This is completely unimplemented -- no handler, no MessageApi endpoint.

**Required additions:**

| Addition | Type | Description |
|----------|------|-------------|
| `NotifyAllowedEnergyTransfer` MessageApi endpoint | `@AsMessageEndpoint` in new `2.1/MessageApi.ts` | REST endpoint to trigger CSMS sending this to a station |
| `NotifyAllowedEnergyTransfer` response handler | `@AsHandler` in `module.ts` | Handle the station's response to the allowed energy transfer notification |
| Add to config `evdriver.responses` | Config change | Add `OCPP_CallAction.NotifyAllowedEnergyTransfer` to the responses array |

### 4. MeterValueUtils (`00_Base/src/util/MeterValueUtils.ts`)

**Critical V2X gap:** This utility only processes:
- `Energy.Active.Import.Register` (via `getRegisterValuesMap`)
- `Energy.Active.Import.Interval` (via `getIntervalValuesMap`)
- `Energy.Active.Net` (via `getNetValuesMap`)

For V2X discharge, the charging station reports **Export** measurands:
- `Energy.Active.Export.Register` -- cumulative energy discharged
- `Energy.Active.Export.Interval` -- interval energy discharged
- `Power.Active.Export` -- instantaneous discharge power

**Required changes:**

| Change | Description |
|--------|-------------|
| Add `getExportRegisterValuesMap()` | Extract `Energy.Active.Export.Register` values |
| Add `getExportIntervalValuesMap()` | Extract `Energy.Active.Export.Interval` values |
| Update `getTotalKwh()` | Calculate net energy = Import - Export for V2X transactions |
| Add `getTotalExportKwh()` | Separate export tracking for billing/reporting |

**Design decision:** `Energy.Active.Net` is already supported and gives bidirectional net energy. For transactions with V2X, the best approach is: if `Energy.Active.Net` measurands are present, use them (they already account for bidirectional flow). If only separate Import/Export registers are available, compute net from both. The `totalKwh` on `Transaction` could go negative for net-discharge sessions -- the model uses `DECIMAL` which supports this.

### 5. Data Model (`01_Data`)

**Transaction model (`01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts`):**

Current columns relevant to V2X:
- `chargingState` (STRING) -- already supports `ChargingStateEnumType` values including `Idle`, `EVConnected`, `Charging`, `SuspendedEV`, `SuspendedEVSE`
- `totalKwh` (DECIMAL) -- can hold negative values (net discharge)
- `totalCost` (DECIMAL) -- may need to handle discharge credits
- `meterStart` (DECIMAL) -- baseline for energy calculation

**Missing columns that may be needed:**

| Column | Type | Purpose |
|--------|------|---------|
| `operationMode` | STRING | Store the OCPP 2.1 `OperationModeEnumType` for the transaction |
| `totalExportKwh` | DECIMAL | Track cumulative export energy separately from import |
| `totalImportKwh` | DECIMAL | Track cumulative import energy separately |

**Assessment:** `operationMode` is the most important addition because it tells the CSMS whether this is a charging-only or V2X transaction. The separate import/export kWh columns are useful for billing but could be deferred to a later phase -- `totalKwh` as net energy works for the initial V2X validation.

**Migration needed:** If `operationMode` column is added, a new Sequelize migration file is needed in `migrations/`.

### 6. Configuration (`Server/src/config/envs/docker.ts`)

**Current state:**
- `NotifyEVChargingNeeds` is in `smartcharging.requests` -- correct
- `TransactionEvent` is in `transactions.requests` -- correct
- `MeterValues` is in `transactions.requests` -- correct
- `RequestStartTransaction` is in `evdriver.responses` -- correct (CSMS sends, station responds)
- `RequestStopTransaction` is in `evdriver.responses` -- correct
- `NotifyAllowedEnergyTransfer` is **nowhere** in the config

**Required config change:**
```typescript
evdriver: {
  responses: [
    // ... existing ...
    OCPP_CallAction.NotifyAllowedEnergyTransfer,  // ADD THIS
  ],
}
```

This is needed because `NotifyAllowedEnergyTransfer` is a CSMS-initiated message (CSMS sends Call, station sends CallResult). The EVDriver module needs to subscribe to the response queue for this action.

## Patterns to Follow

### Pattern 1: Version-Specific Handler Registration

**What:** Use `@AsHandler` with specific OCPP version arrays to create version-specific handlers.
**When:** When 2.1 request/response types differ from 2.0.1 in ways that require different processing logic.
**Example (from existing code):**
```typescript
// 2.0.1-specific handler
@AsHandler([OCPPVersion.OCPP2_0_1], OCPP_CallAction.TransactionEvent)
protected async _handleTransactionEvent(
  message: IMessage<OCPP2_0_1.TransactionEventRequest>,
): Promise<void> { /* ... */ }

// New 2.1-specific handler to add
@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.TransactionEvent)
protected async _handleTransactionEvent21(
  message: IMessage<OCPP2_1.TransactionEventRequest>,
): Promise<void> { /* ... */ }
```

### Pattern 2: OCPP_2_VER_LIST for Shared Handlers

**What:** Use `OCPP_2_VER_LIST` (`[OCPPVersion.OCPP2_0_1, OCPPVersion.OCPP2_1]`) when the handler logic is identical for both versions.
**When:** The request/response types are compatible and no version-specific logic is needed.
**Example:** `StatusNotification`, `CostUpdated`, `ClearedChargingLimit` use this pattern already.

### Pattern 3: MessageApi Per OCPP Version

**What:** Create version-specific MessageApi classes in separate directories (`2.0.1/MessageApi.ts`, `2.1/MessageApi.ts`).
**When:** REST endpoint needs to send version-specific OCPP messages.
**Example:** `NotifyAllowedEnergyTransfer` only exists in OCPP 2.1, so it belongs in a `2.1/MessageApi.ts` for the EVDriver module.

### Pattern 4: Config-Driven Action Routing

**What:** Module `requests` and `responses` arrays in `SystemConfig` determine which OCPP actions a module subscribes to via RabbitMQ.
**When:** Adding any new OCPP action handler to a module.
**Critical:** If the action is not listed in the module's config `requests` (for CS-initiated) or `responses` (for CSMS-initiated), the RabbitMQ subscription will not be created and the handler will never fire.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Creating a New V2X Module

**What:** Creating a `03_Modules/V2X/` module for V2X discharge handling.
**Why bad:** V2X discharge uses the same OCPP messages as regular charging (TransactionEvent, MeterValues, NotifyEVChargingNeeds) -- just with additional fields and different parameter values. Creating a separate module would fragment responsibility and break the action-routing model where one action maps to one module.
**Instead:** Extend existing modules with version-specific handlers.

### Anti-Pattern 2: Modifying 2.0.1 Handlers for V2X

**What:** Adding V2X logic to the existing `@AsHandler([OCPPVersion.OCPP2_0_1], ...)` handlers.
**Why bad:** V2X fields (`operationMode`, `v2xChargingParameters`, `costDetails`) do not exist in OCPP 2.0.1. Adding them to 2.0.1 handlers would break type safety and violate the existing code's convention of version-specific handlers.
**Instead:** Create new `@AsHandler([OCPPVersion.OCPP2_1], ...)` handlers alongside existing ones.

### Anti-Pattern 3: Ignoring Energy Export Measurands

**What:** Treating V2X discharge transactions the same as charge-only transactions in meter value processing.
**Why bad:** During discharge, energy flows from EV to grid. If `MeterValueUtils` only tracks Import, the CSMS will show 0 kWh for discharge periods, or worse, report incorrect net energy. Billing, reporting, and grid reconciliation all depend on accurate bidirectional metering.
**Instead:** Extend `MeterValueUtils` to handle Export measurands and net energy calculation.

## Build Order for Implementation

The dependency order is driven by CitrineOS's layer hierarchy (`00_Base` -> `01_Data` -> `02_Util` -> `03_Modules` -> `Server`):

### Phase 1: Foundation (00_Base + 01_Data)

**Must be first because modules depend on these layers.**

1. **MeterValueUtils** (`00_Base/src/util/MeterValueUtils.ts`) -- Add Export measurand handling
2. **Transaction model** (`01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts`) -- Add `operationMode` column if decided
3. **Migration** (`migrations/`) -- Database migration for new columns
4. **TransactionEvent repository** (`01_Data/src/layers/sequelize/repository/TransactionEvent.ts`) -- Update `createOrUpdateTransactionByTransactionEventAndStationId` to handle 2.1-specific fields

### Phase 2: SmartCharging V2X Support (03_Modules/SmartCharging)

**Can proceed in parallel with Phase 3 after Phase 1 completes.**

1. **InternalSmartCharging** -- Add BPT/V2X cases to `calculateChargingProfile()`
2. **SmartChargingModule handler** -- Update `_handleNotifyEVChargingNeeds` to check `v2xChargingParameters`
3. **ISmartCharging interface** -- May need update if signature changes

### Phase 3: Transaction Handlers (03_Modules/Transactions)

**Can proceed in parallel with Phase 2 after Phase 1 completes.**

1. **TransactionEvent 2.1 handler** -- Add `_handleTransactionEvent21` with `operationMode` and `costDetails` processing
2. **MeterValues 2.1 handler** -- Add `_handleMeterValues21` with Export measurand processing
3. **TransactionService** -- Update `recalculateTotalKwh` for bidirectional energy

### Phase 4: EVDriver + NotifyAllowedEnergyTransfer (03_Modules/EVDriver)

**Depends on nothing from Phases 2-3, but logically comes after because it is the control message.**

1. **EVDriver module** -- Add response handler for `NotifyAllowedEnergyTransfer`
2. **2.1/MessageApi.ts** -- Create new file with `@AsMessageEndpoint` for `NotifyAllowedEnergyTransfer`
3. **EVDriver interface** -- Update `IEVDriverModuleApi` for new endpoint

### Phase 5: Configuration + Integration (Server)

**Last because it ties everything together.**

1. **Docker config** -- Add `NotifyAllowedEnergyTransfer` to `evdriver.responses`
2. **Local config** -- Same change for local dev
3. **End-to-end test** -- V2X discharge flow test

### Dependency Graph

```
Phase 1 (Foundation)
    |
    +--- Phase 2 (SmartCharging V2X)
    |
    +--- Phase 3 (Transaction Handlers)
    |
    +--- Phase 4 (EVDriver + NotifyAllowedEnergyTransfer)
    |
    v
Phase 5 (Config + Integration)
```

Phases 2, 3, and 4 can proceed in parallel after Phase 1 completes. Phase 5 requires all others to complete.

## Handler Method Requirements Summary

| Module | Handler Method | Decorator | Request Type | Purpose |
|--------|---------------|-----------|--------------|---------|
| Transactions | `_handleTransactionEvent21` | `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.TransactionEvent)` | `OCPP2_1.TransactionEventRequest` | V2X transaction lifecycle with operationMode |
| Transactions | `_handleMeterValues21` | `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.MeterValues)` | `OCPP2_1.MeterValuesRequest` | Export measurand processing |
| EVDriver | `_handleNotifyAllowedEnergyTransfer` | `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.NotifyAllowedEnergyTransfer)` | `OCPP2_1.NotifyAllowedEnergyTransferResponse` | Process station response |
| EVDriver | `notifyAllowedEnergyTransfer` | `@AsMessageEndpoint(OCPP_CallAction.NotifyAllowedEnergyTransfer, ...)` | `OCPP2_1.NotifyAllowedEnergyTransferRequest` | REST API to trigger sending |

**Handlers that already work for V2X (no changes needed):**

| Module | Handler | Why It Works |
|--------|---------|-------------|
| SmartCharging | `_handleNotifyEVChargingNeeds` | Already uses `OCPP_2_VER_LIST`; needs internal logic update but handler registration is correct |
| SmartCharging | `_handleNotifyEVChargingSchedule` | Already handles both versions |
| SmartCharging | `_handleSetChargingProfile` (response) | Works for V2X profile responses |
| EVDriver | `_handleRequestStartTransaction` (response) | Already uses `OCPP_2_VER_LIST` |
| EVDriver | `_handleRequestStopTransaction` (response) | Already uses `OCPP_2_VER_LIST` |
| Transactions | `_handleStatusNotification` | Already uses `OCPP_2_VER_LIST` |
| Transactions | `_handleCostUpdated` (response) | Already uses `OCPP_2_VER_LIST` |
| Configuration | BootNotification/Heartbeat | 2.1 boot process same as 2.0.1 |

## Data Flow: Complete V2X Discharge Session

```
1. CS -> BootNotification -> Configuration module -> BootNotificationResponse
   (Station connects on port 8083, ocpp2.1 subprotocol)

2. CS -> Authorize(idToken) -> EVDriver module -> AuthorizeResponse
   (Standard authorization - 2.0.1 handler works for 2.1 basic tokens)

3. CS -> TransactionEvent(Started, operationMode: CentralSetpoint)
   -> Transactions module [2.1 handler needed]
   -> Stores transaction with operationMode
   -> TransactionEventResponse

4. CS -> NotifyEVChargingNeeds(requestedEnergyTransfer: DC_BPT, v2xChargingParameters: {...})
   -> SmartCharging module [BPT support needed in calculateChargingProfile]
   -> Generates bidirectional charging profile
   -> NotifyEVChargingNeedsResponse(Accepted)
   -> SetChargingProfile(bidirectional profile) -> CS

5. CSMS -> NotifyAllowedEnergyTransfer(transactionId, [DC_BPT]) -> CS
   [Completely new - EVDriver module]
   CS -> NotifyAllowedEnergyTransferResponse -> EVDriver module

6. CS -> TransactionEvent(Updated, meterValue: [Energy.Active.Export.Register: X])
   -> Transactions module [Export measurand support needed]
   -> Updates totalKwh (net = import - export)
   -> TransactionEventResponse

7. CS -> MeterValues(sampledValue: [Power.Active.Export: Y, Energy.Active.Export.Interval: Z])
   -> Transactions module [Export measurand support needed]
   -> MeterValuesResponse

8. CS -> TransactionEvent(Ended)
   -> Transactions module
   -> Finalizes transaction, calculates final cost
   -> TransactionEventResponse(totalCost)
```

## Scalability Considerations

| Concern | Current State | V2X Impact |
|---------|--------------|------------|
| Meter value storage | Stores all sampled values in PostgreSQL | V2X sessions may have more measurands (both Import and Export), doubling meter value records per interval |
| Transaction cost calculation | `CostCalculator` uses `totalKwh` for pricing | Discharge sessions may result in negative costs (credits) -- `CostCalculator` needs to handle this |
| Concurrent V2X sessions | No specific limit | V2X sessions are no different from charging sessions architecturally |
| Message volume | Standard RabbitMQ routing | No additional volume -- same messages, different field values |

## Sources

All findings are from direct codebase analysis of the `feature/ocpp-2.1` branch:

- `03_Modules/Transactions/src/module/module.ts` -- TransactionEvent and MeterValues handlers, TODO comments at lines 429 and 502
- `03_Modules/SmartCharging/src/module/module.ts` -- NotifyEVChargingNeeds handler
- `03_Modules/SmartCharging/src/module/smartCharging/InternalSmartCharging.ts` -- calculateChargingProfile with unsupported BPT modes
- `03_Modules/EVDriver/src/module/module.ts` -- RequestStartTransaction/Stop handlers
- `00_Base/src/util/MeterValueUtils.ts` -- Import-only energy tracking
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- EnergyTransferModeEnumType with BPT values, MeasurandEnumType with Export values
- `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts` -- V2XChargingParametersType
- `00_Base/src/ocpp/model/2.1/types/TransactionEventRequest.ts` -- OperationModeEnumType, CostDetailsType
- `00_Base/src/ocpp/model/2.1/types/NotifyAllowedEnergyTransferRequest.ts` -- Unimplemented message type
- `01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts` -- Transaction model schema
- `Server/src/config/envs/docker.ts` -- Module action routing configuration

---

*Architecture analysis: 2026-03-26*
