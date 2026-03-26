# Technology Stack: OCPP 2.1 V2X Discharge Protocol Components

**Project:** CitrineOS OCPP 2.1 V2X Discharge Testing
**Researched:** 2026-03-26
**Mode:** Stack dimension (protocol-level components)
**Overall Confidence:** HIGH -- findings derived from direct codebase inspection of existing OCPP 2.1 JSON schemas, TypeScript types, and handler implementations already present in CitrineOS

## Executive Summary

CitrineOS already has the complete OCPP 2.1 protocol layer (JSON schemas, TypeScript types, enum definitions) for V2X/bidirectional power transfer. The WebSocket endpoint on port 8083 with `ocpp2.1` subprotocol is configured and operational. However, the **business logic handlers** have critical gaps: the TransactionEvent handler exists only for OCPP 2.0.1 (with an explicit TODO for 2.1), the NotifyEVChargingNeeds handler ignores V2X charging parameters and BPT energy transfer modes, and there is no handler at all for NotifyAllowedEnergyTransfer (a new OCPP 2.1 message central to V2X flows). The data models (ChargingNeeds, Transaction) also lack V2X-specific fields.

No new technology or dependencies are needed. This is a matter of extending existing handlers and data models to handle the V2X protocol semantics that the schema layer already supports.

## Existing Infrastructure (Already Present)

These components are validated as working and require no changes for V2X discharge support.

### WebSocket Configuration
| Component | Status | Detail |
|-----------|--------|--------|
| WS endpoint port 8083 | Present | `Server/src/config/envs/docker.ts` line 260, protocol `ocpp2.1` |
| Subprotocol negotiation | Present | `WebsocketNetworkConnection._handleProtocols()` accepts `ocpp2.1` |
| OCPPVersion enum | Present | `OCPPVersion.OCPP2_1 = 'ocpp2.1'` in `00_Base/src/ocpp/rpc/message.ts` |
| Version-aware routing | Present | `mapToCallAction()` handles `OCPPVersion.OCPP2_1` with `OCPP2_1_CallActions` set |
| `OCPP_2_VER_LIST` constant | Present | `[OCPPVersion.OCPP2_0_1, OCPPVersion.OCPP2_1]` -- used by many handlers |

**Why no WebSocket changes:** The `_handleProtocols` method at `02_Util/src/networkconnection/WebsocketNetworkConnection.ts:272` already negotiates `ocpp2.1` as a valid subprotocol. The `_onMessage` handler passes the negotiated protocol version through to the router. The OCPP 2.1 wire format is identical to 2.0.1 (JSON-RPC over WebSocket with `[MessageTypeId, UniqueId, Action, Payload]` framing).

### JSON Schemas (All Present)
| Schema | Path | Status |
|--------|------|--------|
| TransactionEventRequest | `00_Base/src/ocpp/model/2.1/schemas/TransactionEventRequest.json` | Complete with OperationModeEnumType, ChargingStateEnumType |
| TransactionEventResponse | `00_Base/src/ocpp/model/2.1/schemas/TransactionEventResponse.json` | Present |
| MeterValuesRequest | `00_Base/src/ocpp/model/2.1/schemas/MeterValuesRequest.json` | Complete with all V2X measurands |
| NotifyEVChargingNeedsRequest | `00_Base/src/ocpp/model/2.1/schemas/NotifyEVChargingNeedsRequest.json` | Complete with V2XChargingParametersType |
| NotifyAllowedEnergyTransferRequest | `00_Base/src/ocpp/model/2.1/schemas/NotifyAllowedEnergyTransferRequest.json` | Present |
| NotifyAllowedEnergyTransferResponse | `00_Base/src/ocpp/model/2.1/schemas/NotifyAllowedEnergyTransferResponse.json` | Present |
| RequestStartTransactionRequest | `00_Base/src/ocpp/model/2.1/schemas/RequestStartTransactionRequest.json` | Present with OperationModeEnumType |

**Why no schema changes:** The auto-generated types from `json-schema-to-typescript` already produce complete TypeScript interfaces for all V2X-related request/response types. The JSON schemas are the authoritative OCPP 2.1 Edition 1 schemas from OCA.

### TypeScript Types (All Present)
| Type | File | Key V2X Fields |
|------|------|----------------|
| `TransactionEventRequest` | `00_Base/src/ocpp/model/2.1/types/TransactionEventRequest.ts` | `transactionInfo.operationMode`, `transactionInfo.chargingState`, `meterValue` with Export measurands |
| `V2XChargingParametersType` | `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts:632` | `minDischargePower`, `maxDischargePower`, `minDischargeCurrent`, `maxDischargeCurrent`, `evMinV2XEnergyRequest`, `evMaxV2XEnergyRequest` |
| `NotifyAllowedEnergyTransferRequest` | `00_Base/src/ocpp/model/2.1/types/NotifyAllowedEnergyTransferRequest.ts` | `transactionId`, `allowedEnergyTransfer[]` |
| `EVEnergyOfferType` | `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts:421` | `evPowerSchedule`, `evAbsolutePriceSchedule` |
| `MeterValuesRequest` | `00_Base/src/ocpp/model/2.1/types/MeterValuesRequest.ts` | `SampledValueType` with `MeasurandEnumType` including Export variants |

### Enums (All Present)
| Enum | Key V2X Values | Purpose |
|------|----------------|---------|
| `EnergyTransferModeEnumType` | `AC_BPT`, `AC_BPT_DER`, `DC_BPT`, `DC_ACDP_BPT` | Identifies bidirectional power transfer modes. `BPT` = Bidirectional Power Transfer |
| `OperationModeEnumType` | `CentralSetpoint`, `ExternalSetpoint`, `ExternalLimits` | Controls whether CSMS or external system sets discharge power levels |
| `ChargingStateEnumType` | `Charging`, `Idle`, `SuspendedEV`, `SuspendedEVSE` | Note: No explicit "Discharging" state. Discharge is indicated by negative power measurands while in `Charging` state |
| `MeasurandEnumType` | See table below | Full set of import/export/V2X measurands |
| `TriggerReasonEnumType` | `ChargingStateChanged`, `OperationModeChanged`, `ChargingRateChanged` | V2X transitions trigger TransactionEvents |
| `NotifyAllowedEnergyTransferStatusEnumType` | `Accepted`, `Rejected` | Response to CSMS telling CS which energy transfer modes are allowed |

## V2X-Specific Measurands (All Present in MeasurandEnumType)

These are the measurands that a CSMS must be prepared to receive and store during V2X discharge. All are already defined in the `MeasurandEnumType` enum at `00_Base/src/ocpp/model/2.1/enums/index.ts:1209`.

### Core Discharge Measurands
| Measurand | Value | Unit | Why Needed |
|-----------|-------|------|------------|
| `Energy.Active.Export.Register` | Cumulative Wh exported from EV to grid | Wh | Primary metric for total energy discharged. Running total. |
| `Energy.Active.Export.Interval` | Wh exported in current interval | Wh | Per-interval discharge amount for billing/reporting |
| `Power.Active.Export` | Instantaneous power flowing from EV to grid | W | Real-time discharge power level |
| `Current.Export` | Current flowing from EV to grid | A | Per-phase current during discharge |

### V2X Energy Request Measurands
| Measurand | Value | Unit | Why Needed |
|-----------|-------|------|------------|
| `EnergyRequest.Minimum.V2X` | Min energy request for V2X cycling | Wh | EV's minimum SoC boundary for V2X operations |
| `EnergyRequest.Maximum.V2X` | Max energy request for V2X cycling | Wh | EV's maximum SoC boundary for V2X operations |

### Supporting Measurands
| Measurand | Value | Unit | Why Needed |
|-----------|-------|------|------------|
| `SoC` | State of Charge | % | Critical for knowing when to stop discharging |
| `Power.Active.Import` | Instantaneous power from grid to EV | W | Reference during bidirectional transitions |
| `Energy.Active.Import.Register` | Cumulative Wh imported | Wh | Track net energy transfer |
| `Energy.Active.Net` | Net energy (import - export) | Wh | Single value showing net direction |
| `Power.Active.Setpoint` | Requested power setpoint | W | What the CSMS/external system requested. Negative = discharge |
| `Power.Export.Offered` | Max export power offered | W | EVSE's available discharge capacity |
| `Power.Export.Minimum` | Min export power | W | Minimum viable discharge power |
| `Voltage` | Voltage | V | Required for DC discharge monitoring |

## OCPP 2.1 V2X Discharge Message Flow

This is the protocol-level sequence that the CSMS must support. Messages marked with a gap indicator are where CitrineOS currently has incomplete handling.

```
1. CS -> CSMS: BootNotification                    [HANDLED - existing]
2. CS -> CSMS: StatusNotification (Available)      [HANDLED - existing]
3. CS -> CSMS: TransactionEvent (Started)          [GAP - no OCPP 2.1 handler]
     - triggerReason: Authorized | RemoteStart | EVDetected
     - transactionInfo.chargingState: EVConnected
4. CS -> CSMS: NotifyEVChargingNeeds               [GAP - ignores V2X params]
     - chargingNeeds.requestedEnergyTransfer: AC_BPT | DC_BPT | ...
     - chargingNeeds.v2xChargingParameters: { minDischargePower, maxDischargePower, ... }
     - chargingNeeds.evEnergyOffer: { evPowerSchedule: {...} }
5. CSMS -> CS: NotifyAllowedEnergyTransfer         [GAP - no handler, not in config]
     - allowedEnergyTransfer: [AC_BPT] | [DC_BPT] | ...
6. CS -> CSMS: TransactionEvent (Updated)          [GAP - no OCPP 2.1 handler]
     - triggerReason: ChargingStateChanged | OperationModeChanged
     - transactionInfo.chargingState: Charging
     - transactionInfo.operationMode: CentralSetpoint | ExternalSetpoint
7. CS -> CSMS: TransactionEvent (Updated)          [GAP - no OCPP 2.1 handler]
     - triggerReason: ChargingRateChanged
     - meterValue: [{ sampledValue: [{ measurand: Power.Active.Export, value: -5000 }] }]
       Note: Export measurands or negative power values indicate discharge
8. CS -> CSMS: MeterValues                         [GAP - no OCPP 2.1 handler]
     - meterValue with Export measurands (Energy.Active.Export.Register, etc.)
9. CS -> CSMS: TransactionEvent (Ended)            [GAP - no OCPP 2.1 handler]
     - triggerReason: EVDeparted | StopAuthorized | RemoteStop
     - transactionInfo.chargingState: Idle
```

## Gaps Requiring Implementation

### Gap 1: OCPP 2.1 TransactionEvent Handler (CRITICAL)
**Location:** `03_Modules/Transactions/src/module/module.ts:429`
**Evidence:** Explicit TODO comment: `//TODO: Need a transaction event handler for OCPP 2.1 as we need to tweak or extend the transaction service for ocpp 2.1`
**Current state:** The existing handler at line 283 is decorated with `@AsHandler([OCPPVersion.OCPP2_0_1], OCPP_CallAction.TransactionEvent)` -- OCPP 2.1 messages routed to the Transactions module for this action will have no handler.
**What's needed:**
- A new handler decorated with `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.TransactionEvent)` or extend to `OCPP_2_VER_LIST`
- Handle the 2.1-specific `TransactionType` which includes `operationMode` (OperationModeEnumType) and `tariffId`
- Process `costDetails` field (new in 2.1)
- Store `operationMode` changes -- the Transaction model currently has no `operationMode` column
- Handle `evseSleep` boolean (new in 2.1)
**Why critical:** Without this handler, no V2X transaction can be started, updated, or stopped via OCPP 2.1.

### Gap 2: OCPP 2.1 MeterValues Handler (CRITICAL)
**Location:** `03_Modules/Transactions/src/module/module.ts:431`
**Evidence:** The handler is decorated with `@AsHandler([OCPPVersion.OCPP2_0_1], OCPP_CallAction.MeterValues)` -- excludes OCPP 2.1.
**What's needed:**
- Extend decorator to `OCPP_2_VER_LIST` or add a separate 2.1 handler
- The MeterValue data model (`01_Data/src/layers/sequelize/model/TransactionEvent/MeterValue.ts`) stores `sampledValue` as JSONB, so it can already persist Export measurands without schema changes
- Handler logic must not reject or misinterpret Export/V2X measurand types
**Why critical:** V2X discharge sessions produce Energy.Active.Export and Power.Active.Export measurands that need to be stored.

### Gap 3: NotifyEVChargingNeeds V2X Parameter Handling (HIGH)
**Location:** `03_Modules/SmartCharging/src/module/module.ts:175-234`
**Evidence:** The handler checks `hasAcOrDcChargingParameters` (line 197-198) but does NOT check for `v2xChargingParameters`. It also validates `matchedChargingType` (line 201-205) only for DC and non-DC modes, ignoring BPT modes (`AC_BPT`, `DC_BPT`, etc.).
**Current behavior:** A V2X NotifyEVChargingNeeds with `requestedEnergyTransfer: DC_BPT` and `v2xChargingParameters` but no `dcChargingParameters` will be **rejected** (line 210).
**What's needed:**
- Add `v2xChargingParameters` to the validation logic
- Recognize BPT energy transfer modes (`AC_BPT`, `DC_BPT`, `AC_BPT_DER`, `DC_ACDP_BPT`) as valid
- Pass V2X parameters to the smart charging service for profile calculation
- The `calculateChargingProfile` method may need updates to handle bidirectional profiles (discharge limits as negative values or separate discharge schedule periods)

### Gap 4: NotifyAllowedEnergyTransfer Handler (HIGH)
**Location:** Not implemented anywhere in `03_Modules/`
**Evidence:** Grep for `NotifyAllowedEnergyTransfer` in `03_Modules/` returns zero handler matches. The action is also not in any module's `responses` configuration in `Server/src/config/envs/docker.ts`.
**What's needed:**
- This is a CSMS-to-CS message (outbound). The CSMS sends it to tell the CS which energy transfer modes are allowed for a transaction.
- Add `OCPP_CallAction.NotifyAllowedEnergyTransfer` to the SmartCharging module's `responses` list in config
- Implement a MessageApi endpoint that lets the CSMS operator (or automated logic) send this command to a CS
- The response handler (`@AsHandler`) processes the CS's acceptance/rejection status
**Why needed for V2X:** After receiving NotifyEVChargingNeeds with BPT modes, the CSMS must respond with NotifyAllowedEnergyTransfer to confirm which bidirectional modes it permits. Without this, the CS cannot proceed with V2X discharge.

### Gap 5: ChargingNeeds Data Model V2X Fields (MEDIUM)
**Location:** `01_Data/src/layers/sequelize/model/ChargingProfile/ChargingNeeds.ts`
**Evidence:** The model has `acChargingParameters` (JSONB) and `dcChargingParameters` (JSONB) columns but no `v2xChargingParameters` column, no `controlMode` column, no `mobilityNeedsMode` column, and no `availableEnergyTransfer` column.
**What's needed:**
- Add `v2xChargingParameters` as JSONB column
- Add `controlMode` as STRING column (ControlModeEnumType)
- Add `mobilityNeedsMode` as STRING column (MobilityNeedsModeEnumType)
- Add `availableEnergyTransfer` as JSONB column (array of EnergyTransferModeEnumType)
- Add `evEnergyOffer` as JSONB column (optional, for V2X energy offer data)
- Create a database migration for these columns
**Why needed:** The smart charging service reads ChargingNeeds to calculate profiles. V2X discharge profiles require knowing the EV's discharge power limits and energy boundaries.

### Gap 6: Transaction Model OperationMode (MEDIUM)
**Location:** `01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts`
**Evidence:** The Transaction model has `chargingState` (STRING) but no `operationMode` column. The OCPP 2.1 TransactionType includes `operationMode` as a key field.
**What's needed:**
- Add `operationMode` as STRING column (OperationModeEnumType)
- Update `createOrUpdateTransactionByTransactionEventAndStationId` repository method to persist operationMode
- Create a database migration
**Why needed:** The operation mode (CentralSetpoint, ExternalSetpoint, etc.) determines how the CSMS controls the discharge power level. Without tracking it, the CSMS cannot make correct charging profile decisions.

## Configuration Changes Required

### Docker Config (`Server/src/config/envs/docker.ts`)

```typescript
// In the smartcharging module config, add to responses:
smartcharging: {
  endpointPrefix: '/smartcharging',
  responses: [
    // ... existing ...
    OCPP_CallAction.NotifyAllowedEnergyTransfer,  // NEW: V2X energy transfer authorization
  ],
  requests: [
    // ... existing (NotifyEVChargingNeeds already present) ...
  ],
},
```

The same change is needed in `local.ts` and `swarm.docker.ts`.

### No WebSocket Configuration Changes Needed

The WebSocket server at port 8083 already:
- Binds to `0.0.0.0:8083`
- Uses `protocol: 'ocpp2.1'`
- Sets `securityProfile: 0` (no auth -- suitable for testing)
- Enables `allowUnknownChargingStations: true`
- Has `dynamicTenantResolution: true`

## Technology Decisions

### No New Dependencies Required
| Decision | Rationale |
|----------|-----------|
| No new npm packages | All V2X protocol types, schemas, and validation infrastructure already exist in `@citrineos/base` |
| No WebSocket library changes | The `ws` library handles `ocpp2.1` subprotocol identically to `ocpp2.0.1` |
| No new database engine | PostgreSQL with JSONB columns can store all V2X parameter structures |
| No new message broker topics | RabbitMQ queues already route by EventGroup; SmartCharging and Transactions modules already have queues |

### Database Migration Strategy
| Approach | Decision | Rationale |
|----------|----------|-----------|
| Use `sequelize-cli` migrations | Yes | Consistent with existing migration approach in `migrations/` directory |
| Add V2X columns as nullable | Yes | Backward compatible -- existing OCPP 2.0.1 transactions remain valid |
| Store V2X params as JSONB | Yes | Consistent with how `acChargingParameters` and `dcChargingParameters` are stored |
| Use DB_STRATEGY=migrate | Yes | Default strategy in docker entrypoint |

### Handler Extension Strategy
| Approach | Decision | Rationale |
|----------|----------|-----------|
| Separate 2.1 handler vs extending existing | Separate handler | The explicit TODO at line 429 of Transactions module and the fact that 2.1 TransactionEventRequest has different fields (costDetails, evseSleep, operationMode on TransactionType) warrant a distinct handler |
| Use `OCPP_2_VER_LIST` for MeterValues | Extend existing | MeterValues structure is compatible; only the measurand values differ, and those are enum-based (no code change needed for new enum values in JSONB) |
| NotifyAllowedEnergyTransfer module placement | SmartCharging module | This message is part of the energy transfer authorization flow, which is a smart charging concern (deciding what power modes to allow) |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| V2X param storage | JSONB column | Separate relational tables | V2XChargingParametersType has 20+ optional fields; relational table would be over-normalized for read patterns |
| TransactionEvent 2.1 | New handler method | Extend 2.0.1 handler | Different type signatures (`OCPP2_1.TransactionEventRequest` vs `OCPP2_0_1.TransactionEventRequest`), different fields to process |
| NotifyAllowedEnergyTransfer | SmartCharging module | EVDriver module | SmartCharging already handles NotifyEVChargingNeeds and charging profiles; the energy transfer authorization is the response to charging needs |
| Operation mode tracking | Column on Transaction | Column on TransactionEvent | Operation mode is a transaction-level state that changes over time; storing latest on Transaction is consistent with `chargingState` pattern |

## Sources

All findings are from direct codebase inspection (HIGH confidence):
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- enum definitions with all V2X values
- `00_Base/src/ocpp/model/2.1/types/` -- auto-generated TypeScript types from official OCA JSON schemas
- `00_Base/src/ocpp/model/2.1/schemas/` -- official OCPP 2.1 Edition 1 JSON schemas
- `00_Base/src/ocpp/rpc/message.ts` -- OCPP_CallAction enum, version lists, action routing
- `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` -- WebSocket subprotocol handling
- `03_Modules/Transactions/src/module/module.ts` -- TransactionEvent and MeterValues handlers (with TODO at line 429)
- `03_Modules/SmartCharging/src/module/module.ts` -- NotifyEVChargingNeeds handler (V2X gap at lines 197-210)
- `01_Data/src/layers/sequelize/model/` -- data models for Transaction, TransactionEvent, ChargingNeeds, MeterValue
- `Server/src/config/envs/docker.ts` -- module action routing configuration

OCPP 2.1 specification semantics verified against the authoritative JSON schemas bundled in the codebase (marked "OCPP 2.1 Edition 1 (c) OCA"). The V2X discharge flow sequence is derived from the OCPP 2.1 Part 2 use cases for bidirectional power transfer (K17 use case family).
