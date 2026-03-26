# Feature Landscape: OCPP 2.1 V2X Discharge on CitrineOS

**Domain:** CSMS (Charging Station Management System) V2X Discharge Support
**Researched:** 2026-03-26
**Overall Confidence:** HIGH (based on codebase analysis and OCPP 2.1 type definitions)

## Complete V2X Discharge Message Flow

This is the end-to-end OCPP 2.1 message sequence for a V2X discharge session. Each step documents the CSMS responsibility.

### Phase 1: Connection and Boot

```
Station                           CSMS
  |                                 |
  |--- WebSocket Connect ---------->|  (ws://host:8083, subprotocol: ocpp2.1)
  |                                 |  CSMS: Authenticate, register connection
  |--- BootNotification ----------->|
  |<-- BootNotificationResponse ----|  CSMS: Return Accepted, set heartbeat interval
  |                                 |
```

**CSMS Responsibility:** Accept OCPP 2.1 WebSocket connections. Already functional on port 8083.

### Phase 2: Authorization

```
Station                           CSMS
  |                                 |
  |--- Authorize ------------------>|  (idToken for V2X-capable driver)
  |<-- AuthorizeResponse -----------|  CSMS: Validate token, return Accepted
  |                                 |
```

**CSMS Responsibility:** Authorize the EV driver. Existing handler works but has a TODO for OCPP 2.1-specific authorization logic (see `EVDriver/module.ts:503`).

### Phase 3: Transaction Start

```
Station                           CSMS
  |                                 |
  |--- TransactionEvent(Started) -->|  eventType: Started
  |    transactionInfo:             |  triggerReason: Authorized or CablePluggedIn or RemoteStart
  |      transactionId: "tx-123"    |  chargingState: EVConnected
  |      chargingState: EVConnected |  operationMode: CentralSetpoint (or ExternalSetpoint)
  |      operationMode: CentralSetpoint
  |<-- TransactionEventResponse ----|  CSMS: Create transaction record, return idTokenInfo
  |                                 |
```

**CSMS Responsibility:**
- Create/update transaction record with the new `operationMode` field (NEW -- not currently stored)
- Handle `OperationModeEnumType` values: `CentralSetpoint`, `ExternalSetpoint`, `ExternalLimits` are the modes relevant to V2X discharge
- The existing handler at `Transactions/module.ts:283` handles OCPP 2.0.1 only; line 429 has a TODO for OCPP 2.1 handler

### Phase 4: EV Charging Needs with V2X Parameters

```
Station                           CSMS
  |                                 |
  |--- NotifyEVChargingNeeds ------>|  evseId: 1
  |    chargingNeeds:               |  requestedEnergyTransfer: AC_BPT or DC_BPT
  |      requestedEnergyTransfer:   |  v2xChargingParameters: {
  |        AC_BPT or DC_BPT        |    minChargePower, maxChargePower,
  |      v2xChargingParameters: {   |    minDischargePower, maxDischargePower,
  |        maxDischargePower: 7000  |    evMinV2XEnergyRequest, evMaxV2XEnergyRequest,
  |        minDischargePower: 1000  |    ...
  |        evMinV2XEnergyRequest    |  }
  |        evMaxV2XEnergyRequest    |  controlMode: DynamicControl or ScheduledControl
  |      }                         |
  |      controlMode: DynamicControl|
  |<-- NotifyEVChargingNeedsResp ---|  CSMS: Return Accepted/Processing
  |                                 |
  |                                 |  CSMS then calculates discharge profile:
  |<-- SetChargingProfile ----------|  chargingProfile with:
  |    chargingSchedulePeriod:      |    operationMode: CentralSetpoint
  |      dischargeLimit: -7000      |    setpoint: -5000 (negative = discharge)
  |      setpoint: -5000           |    dischargeLimit: -7000 (negative = discharge limit)
  |--- SetChargingProfileResp ---->|
  |                                 |
```

**CSMS Responsibility (CRITICAL -- multiple gaps identified):**
1. Accept `requestedEnergyTransfer` values `AC_BPT`, `DC_BPT`, `AC_BPT_DER`, `DC_ACDP_BPT` (currently rejected -- handler only checks AC/DC non-BPT modes)
2. Process `v2xChargingParameters` from the charging needs (currently ignored -- only `acChargingParameters`/`dcChargingParameters` are checked)
3. Store V2X charging parameters in the database (ChargingNeeds model lacks `v2xChargingParameters` column)
4. Calculate a discharge-aware charging profile with `dischargeLimit` and `setpoint` fields (InternalSmartCharging throws "Unsupported energy transfer mode" for BPT modes)
5. Send `SetChargingProfile` with OCPP 2.1 schedule period fields (`dischargeLimit`, `setpoint`, `operationMode`)

### Phase 5: Discharge Execution with Meter Values

```
Station                           CSMS
  |                                 |
  |--- TransactionEvent(Updated) -->|  chargingState: Discharging (NEW in 2.1)
  |    operationMode: CentralSetpoint  triggerReason: ChargingStateChanged
  |    meterValue:                  |
  |      Energy.Active.Export.Register: 1500 (Wh exported FROM EV)
  |      Power.Active.Export: 5000  |  (W being discharged)
  |      SoC: 75                    |
  |      EnergyRequest.Minimum.V2X  |  (V2X-specific measurands)
  |      EnergyRequest.Maximum.V2X  |
  |<-- TransactionEventResponse ----|  CSMS: Store meter values, track energy exported
  |                                 |
  |--- MeterValues ---------------->|  Periodic discharge meter values
  |    Energy.Active.Export.Register |  Power.Active.Export
  |    Energy.Active.Net            |  (can be negative during discharge)
  |<-- MeterValuesResponse ---------|  CSMS: Store, recalculate energy totals
  |                                 |
```

**CSMS Responsibility (CRITICAL -- gaps in meter value handling):**
1. Recognize `ChargingStateEnumType.Discharging` -- not currently in the 2.0.1 enum, but exists in 2.1 enums. However, `Discharging` does not appear as a distinct value in the ChargingStateEnumType in 2.1 (states are: EVConnected, Charging, SuspendedEV, SuspendedEVSE, Idle). The `MessageStateEnumType` does have `Discharging` but that is for display messages, not transaction state. Discharge is indicated by negative power/energy values and the operationMode, not a separate chargingState.
2. Process `Energy.Active.Export.Register` and `Energy.Active.Export.Interval` measurands -- the `MeterValueUtils.getTotalKwh()` only looks at `Energy.Active.Import.Register`, `Energy.Active.Import.Interval`, and `Energy.Active.Net`. Export measurands are IGNORED.
3. Handle `Energy.Active.Net` which can be negative during discharge -- this IS handled by MeterValueUtils but has no special negative-value logic
4. Track V2X-specific measurands: `EnergyRequest.Minimum.V2X`, `EnergyRequest.Maximum.V2X`
5. `totalKwh` on the Transaction model currently only represents imported energy; discharge sessions need separate export tracking or net energy calculation

### Phase 6: Dynamic Profile Updates (Optional)

```
Station                           CSMS
  |                                 |
  |--- NotifyEVChargingSchedule --->|  EV's actual discharge schedule
  |<-- NotifyEVChargingScheduleResp |  CSMS: Validate within limits
  |                                 |
  |<-- UpdateDynamicSchedule -------|  CSMS updates discharge setpoints in real-time
  |--- UpdateDynamicScheduleResp -->|  (for DynamicControl mode)
  |                                 |
  |<-- PullDynamicScheduleUpdate ---|  Station polls for schedule updates
  |--- PullDynamicScheduleUpdateResp|  (alternative to push model)
  |                                 |
```

**CSMS Responsibility:**
- Handle `NotifyEVChargingSchedule` with discharge limits (existing handler works but does not validate discharge-specific fields)
- Support `UpdateDynamicScheduleRequest` for real-time discharge control (new OCPP 2.1 message)
- Support `PullDynamicScheduleUpdateResponse` (new OCPP 2.1 message)

### Phase 7: Transaction End

```
Station                           CSMS
  |                                 |
  |--- TransactionEvent(Ended) --->|  eventType: Ended
  |    triggerReason: EVDeparted   |  stoppedReason: EVDisconnected
  |    meterValue:                  |  Final meter values with export registers
  |      Energy.Active.Export.Register: 5000
  |      Energy.Active.Import.Register: 0
  |<-- TransactionEventResponse ---|  CSMS: Finalize transaction, calculate costs
  |                                 |
```

**CSMS Responsibility:**
- Calculate final energy totals including exported energy
- Handle cost calculation for discharge (exported energy may have different pricing -- energy sold back vs consumed)
- Close transaction with correct net energy values

### Phase 8: Remote Start/Stop for V2X (CSMS-Initiated)

```
Station                           CSMS
  |                                 |
  |<-- RequestStartTransaction -----|  CSMS initiates a discharge session:
  |    chargingProfile:             |    chargingProfile with discharge setpoints
  |      operationMode: CentralSetpoint
  |      chargingSchedulePeriod:    |    dischargeLimit, setpoint (negative values)
  |        dischargeLimit: -7000    |
  |        setpoint: -5000         |
  |--- RequestStartTransactionResp >|
  |                                 |
  |<-- RequestStopTransaction ------|  CSMS stops the discharge session
  |--- RequestStopTransactionResp ->|
  |                                 |
```

**CSMS Responsibility:**
- REST API endpoint to initiate discharge sessions via `RequestStartTransaction` with a discharge-aware charging profile
- Include `operationMode`, `setpoint`, and `dischargeLimit` in the charging profile schedule periods
- Existing `EVDriverOcpp201Api` handles `RequestStartTransaction` but uses 2.0.1 types only

---

## Table Stakes

Features the CSMS MUST have for V2X discharge to work at all. Missing any of these means the discharge session will fail.

| # | Feature | Why Required | CSMS Responsibility | Current State | Complexity | Notes |
|---|---------|-------------|---------------------|---------------|------------|-------|
| T1 | **Accept BPT EnergyTransferMode in NotifyEVChargingNeeds** | Station sends `AC_BPT`/`DC_BPT` as `requestedEnergyTransfer`. Current handler rejects anything that is not plain AC or DC. | Accept `AC_BPT`, `DC_BPT` transfer modes; validate against `v2xChargingParameters` instead of only `acChargingParameters`/`dcChargingParameters` | BROKEN -- SmartCharging handler at line 197-210 rejects BPT modes. `InternalSmartCharging.calculateChargingProfile` throws at line 100 for unsupported modes. | Medium | The `EnergyTransferModeEnumType` enum already has all BPT values defined in 00_Base |
| T2 | **Process V2XChargingParametersType** | EV sends discharge power limits via `v2xChargingParameters`. CSMS needs these to calculate valid discharge profiles. | Parse `minDischargePower`, `maxDischargePower`, `minDischargeCurrent`, `maxDischargeCurrent`, `evMinV2XEnergyRequest`, `evMaxV2XEnergyRequest`, `targetSoC` | MISSING -- Handler only checks `acChargingParameters`/`dcChargingParameters`. `V2XChargingParametersType` is defined in 2.1 types but never processed. | Medium | Type definitions exist at `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts:632` |
| T3 | **Calculate discharge-aware ChargingProfile** | CSMS must respond to charging needs with a profile containing `dischargeLimit` and `setpoint` (negative values for discharge). | Generate `ChargingSchedulePeriodType` with `dischargeLimit` (negative), `setpoint` (negative), and optionally `operationMode` per period | MISSING -- `InternalSmartCharging` only generates `limit` (charge-only). Does not produce `dischargeLimit` or `setpoint` fields. Uses OCPP 2.0.1 types. | High | Schedule period type already has `dischargeLimit`, `setpoint`, `setpoint_L2`, `setpoint_L3` fields |
| T4 | **OCPP 2.1 TransactionEvent handler** | OCPP 2.1 TransactionEvent has new fields (`operationMode`, `evseSleep`, `costDetails`) that are not handled by the 2.0.1 handler. | Dedicated `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.TransactionEvent)` that processes 2.1-specific fields | MISSING -- Explicit TODO at `Transactions/module.ts:429`: "Need a transaction event handler for OCPP 2.1" | Medium | Handler exists for 2.0.1 and is registered for that version only |
| T5 | **Store operationMode on Transaction** | The `operationMode` field in `TransactionType` indicates whether the station is in `CentralSetpoint`, `ExternalSetpoint`, etc. Essential for understanding whether the transaction is a discharge session. | Add `operationMode` column to Transaction model; persist from TransactionEvent | MISSING -- Transaction model has no `operationMode` field. The field exists in the OCPP 2.1 `TransactionType` but is silently dropped during persistence. | Low | Simple Sequelize model column addition + migration |
| T6 | **Handle Energy.Active.Export measurands** | During discharge, the station reports energy flowing OUT of the EV via `Energy.Active.Export.Register` and `Energy.Active.Export.Interval`. | Track exported energy separately or net energy. Update `MeterValueUtils.getTotalKwh()` to account for export measurands. | BROKEN -- `MeterValueUtils` only looks at `Energy.Active.Import.Register`, `Energy.Active.Import.Interval`, and `Energy.Active.Net`. Export values are silently ignored. `totalKwh` only tracks imported energy. | Medium | Must decide: track net energy (import minus export) or track both separately |
| T7 | **OCPP 2.1 MeterValues handler** | OCPP 2.1 meter values include new measurands (`EnergyRequest.Minimum.V2X`, `EnergyRequest.Maximum.V2X`, `Energy.Active.Setpoint.Interval`, `Power.Active.Setpoint`, etc.) | Dedicated handler that can store and process V2X-specific measurands | MISSING -- Explicit TODO at `Transactions/module.ts:502`: "Need a meter event handler for OCPP 2.1" | Medium | New handler needed; shared logic with 2.0.1 where possible |

## Differentiators

Nice-to-have features for production V2X. Not required for basic discharge flow validation but valuable for real-world deployments.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **DynamicControl mode support** | Enable real-time CSMS-controlled discharge setpoints. CSMS can adjust discharge power second-by-second in response to grid signals. | High | Requires `UpdateDynamicScheduleRequest` message support and real-time setpoint calculation logic |
| D2 | **PullDynamicScheduleUpdate support** | Station polls CSMS for schedule updates instead of push. Some stations prefer pull model. | Medium | New OCPP 2.1 message; response type `PullDynamicScheduleUpdateResponse` includes `dischargeLimit` fields |
| D3 | **V2X energy accounting (separate import/export totals)** | Track energy imported (charged) and exported (discharged) as separate quantities. Essential for billing, regulatory reporting, and grid integration. | Medium | Add `totalExportKwh` field to Transaction model. Modify cost calculation. |
| D4 | **Discharge cost/compensation calculation** | Calculate what the EV driver is paid for discharged energy (inverse of charging cost). Different tariff structures for V2G. | High | Requires tariff model extension for export pricing, cost calculator changes |
| D5 | **SoC-aware discharge management** | Use `Display.PresentSOC`, `Display.MinimumSOC`, `Display.TargetSOC` measurands to prevent over-discharge. Respect `targetSoC` from V2XChargingParameters. | Medium | Logic to monitor SoC thresholds and adjust/stop discharge when SoC floor is reached |
| D6 | **V2XChargingParameters storage in DB** | Persist full V2X charging parameters (discharge power limits, V2X energy bounds, inverter info) for audit trail and analytics. | Medium | Add `v2xChargingParameters` JSONB column to ChargingNeeds model + DTO schema update |
| D7 | **DERChargingParametersType support** | For AC_BPT_DER mode: support Distributed Energy Resource control parameters (inverter settings, islanding detection, reactive power). | High | Complex ISO 15118-20 integration; only relevant for advanced grid services |
| D8 | **EVEnergyOffer processing** | EV declares what energy it can offer for discharge (power schedule, price preferences). CSMS can use this for V2X scheduling optimization. | High | Requires understanding ISO 15118-20 price/energy negotiation |
| D9 | **V2X frequency-watt curve support** | Station can respond to grid frequency deviations using `v2xFreqWattCurve` in charging profiles. CSMS calculates and sends these curves. | High | Advanced grid services feature; `V2XFreqWattPointType` and `V2XSignalWattPointType` already defined in types |
| D10 | **RequestStartTransaction with discharge profile** | CSMS-initiated discharge sessions via REST API with full discharge-aware charging profiles. | Medium | Extend EVDriver MessageApi to support 2.1 types with `operationMode`, `dischargeLimit`, `setpoint` |
| D11 | **2.1 GetCompositeSchedule handler** | Retrieve the effective combined schedule (including discharge limits) from the station. | Low | TODO at `SmartCharging/module.ts:514`. Need 2.1-specific mapper since CompositeScheduleType changed. |
| D12 | **Webhook notifications for discharge events** | Notify external systems (EMS, aggregator, grid operator) when discharge starts/stops/updates. | Low | WebhookDispatcher already exists; just needs to be confirmed working with V2X transaction events |

## Anti-Features

Features to explicitly NOT build for this validation effort.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Smart charging optimization algorithm for V2X | Scope is validation, not optimization. Complex algorithm development is premature. | Use simple pass-through or max-limit profiles. Implement `ISmartCharging` interface for extensibility. |
| ISO 15118 Plug&Charge for V2X | Separate authentication concern. V2X works with basic RFID/token auth too. | Use Security Profile 0 (no auth) or basic auth for testing. |
| Production billing/settlement for V2X energy | Requires regulatory compliance, metering certification, settlement systems. | Track energy quantities accurately; defer billing to future work. |
| Grid operator integration (OpenADR, DERMS) | External system integration is out of scope. | Design `ISmartCharging` interface to be pluggable for future integration. |
| Multi-station V2X aggregation | Coordinating discharge across multiple stations is a fleet management feature. | Focus on single-station, single-EVSE discharge flow. |
| OCPP 2.1 features unrelated to V2X | Tariff management, display messages, firmware updates -- all out of scope. | Only implement what is needed for the discharge transaction flow. |

## Feature Dependencies

```
T5 (store operationMode) --> T4 (2.1 TransactionEvent handler)
    T4 depends on T5 because the handler needs the model to support the new field

T2 (process V2XChargingParameters) --> T1 (accept BPT EnergyTransferMode)
    T1 is the gate: if BPT modes are rejected, V2X params are never reached

T3 (discharge-aware ChargingProfile) --> T2 (V2XChargingParameters)
    T3 needs discharge power limits from T2 to calculate valid profiles

T3 (discharge-aware ChargingProfile) --> T1 (accept BPT)
    T3 can only be triggered after T1 accepts the mode

T6 (export measurands) --> T7 (2.1 MeterValues handler)
    T7 is the handler; T6 is the logic within it

D3 (energy accounting) --> T6 (export measurands)
    Can't do accounting without the data

D4 (discharge cost) --> D3 (energy accounting)
    Cost requires accurate energy quantities

D5 (SoC management) --> T4 (2.1 TransactionEvent handler)
    SoC data arrives in TransactionEvent meter values

D10 (remote start discharge) --> T3 (discharge-aware profile)
    Remote start sends a profile that must include discharge fields

D11 (GetCompositeSchedule) --> T3 (discharge-aware profile)
    Composite schedule must understand discharge limits
```

### Recommended Implementation Order

```
1. T5 (operationMode on Transaction)  -- prerequisite, low complexity
2. T1 (accept BPT modes)              -- unblocks everything V2X
3. T2 (process V2XChargingParameters) -- data input for profile calculation
4. T3 (discharge ChargingProfile)     -- core V2X logic
5. T6 (export measurands)             -- needed for meter value handling
6. T4 (2.1 TransactionEvent handler)  -- ties it together with T5
7. T7 (2.1 MeterValues handler)       -- complete the meter path
```

## MVP Recommendation

**For the stated goal -- "validate V2X discharge end-to-end" -- implement all 7 table stakes features (T1-T7).**

The minimum viable V2X discharge flow requires:
1. **T1 + T2**: The station can tell the CSMS it wants to discharge (NotifyEVChargingNeeds with BPT mode and V2X parameters accepted)
2. **T3**: The CSMS can tell the station how to discharge (SetChargingProfile with discharge limits)
3. **T4 + T5**: The CSMS can track the discharge transaction (TransactionEvent with operationMode)
4. **T6 + T7**: The CSMS can record discharged energy (MeterValues with export measurands)

**Defer all differentiators** except:
- **D6** (V2X parameter storage): Low-hanging fruit during T2 implementation
- **D11** (GetCompositeSchedule 2.1): Simple gap already noted in codebase

**Explicitly defer:**
- D1 (DynamicControl): Requires real-time control loop, significant complexity
- D4 (discharge cost): Requires tariff model changes beyond validation scope
- D7-D9 (DER/grid services): Advanced features for future phases

## Key OCPP 2.1 V2X Types Reference

| Type | Purpose | Location in Codebase |
|------|---------|---------------------|
| `EnergyTransferModeEnumType` (AC_BPT, DC_BPT, etc.) | Declares bidirectional power transfer mode | `00_Base/src/ocpp/model/2.1/enums/index.ts:477` |
| `V2XChargingParametersType` | EV's discharge power/current/energy limits | `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts:632` |
| `OperationModeEnumType` (CentralSetpoint, etc.) | How the CSMS controls discharge | `00_Base/src/ocpp/model/2.1/enums/index.ts:48` |
| `ChargingSchedulePeriodType.dischargeLimit` | Max discharge rate in profile | `00_Base/src/ocpp/model/2.1/types/SetChargingProfileRequest.ts:245` |
| `ChargingSchedulePeriodType.setpoint` | Target charge/discharge rate (negative = discharge) | `00_Base/src/ocpp/model/2.1/types/SetChargingProfileRequest.ts:262` |
| `MeasurandEnumType.Energy_Active_Export_Register` | Energy exported (discharged) from EV | `00_Base/src/ocpp/model/2.1/enums/index.ts:1228` |
| `MeasurandEnumType.EnergyRequest_Minimum_V2X` | Min V2X energy request | `00_Base/src/ocpp/model/2.1/enums/index.ts:1246` |
| `MeasurandEnumType.EnergyRequest_Maximum_V2X` | Max V2X energy request | `00_Base/src/ocpp/model/2.1/enums/index.ts:1247` |
| `TriggerReasonEnumType.OperationModeChanged` | Trigger when switching to/from discharge | `00_Base/src/ocpp/model/2.1/enums/index.ts:522` |
| `ControlModeEnumType` (ScheduledControl, DynamicControl) | Whether EV/CSMS uses scheduled or dynamic control | `00_Base/src/ocpp/model/2.1/enums/index.ts:39` |
| `DERChargingParametersType` | Inverter/DER parameters for AC_BPT_DER | `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts:128` |
| `EVEnergyOfferType` | EV's offered energy for V2X | `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts` (exported from index) |

## Identified Gaps Summary

| Gap | Location | Severity | Description |
|-----|----------|----------|-------------|
| No 2.1 TransactionEvent handler | `Transactions/module.ts:429` | **Critical** | TODO comment, handler only registered for OCPP2_0_1 |
| No 2.1 MeterValues handler | `Transactions/module.ts:502` | **Critical** | TODO comment, handler only registered for OCPP2_0_1 |
| BPT modes rejected in NotifyEVChargingNeeds | `SmartCharging/module.ts:197-210` | **Critical** | Only checks acChargingParameters/dcChargingParameters, not v2xChargingParameters |
| InternalSmartCharging throws on BPT | `SmartCharging/.../InternalSmartCharging.ts:99-100` | **Critical** | Switch statement default throws "Unsupported energy transfer mode" |
| No operationMode in Transaction model | `01_Data/.../Transaction.ts` | **High** | Column does not exist; field silently dropped |
| No v2xChargingParameters in ChargingNeeds model | `01_Data/.../ChargingNeeds.ts` | **High** | Model only has acChargingParameters, dcChargingParameters |
| No v2xChargingParameters in ChargingNeedsDto | `00_Base/src/interfaces/dto/charging.needs.dto.ts` | **High** | Zod schema lacks V2X fields |
| MeterValueUtils ignores export measurands | `00_Base/src/util/MeterValueUtils.ts:94-111` | **High** | Only reads Energy.Active.Import.Register/Interval |
| No 2.1 GetCompositeSchedule handler | `SmartCharging/module.ts:514` | **Medium** | TODO comment |
| No 2.1 Authorize handler | `EVDriver/module.ts:503` | **Medium** | TODO comment, handler uses 2.0.1 types |
| createChargingNeeds uses 2.0.1 types | `01_Data/.../ChargingProfile.ts:190-192` | **Medium** | Parameter typed as `OCPP2_0_1.NotifyEVChargingNeedsRequest` |

## Sources

- **Primary source:** Direct codebase analysis of CitrineOS `feature/ocpp-2.1` branch
- OCPP 2.1 type definitions in `00_Base/src/ocpp/model/2.1/` (types and JSON schemas generated from official OCPP 2.1 specification)
- OCPP 2.1 specification references embedded in type comments (ISO 15118-2, ISO 15118-20 mappings)
- Open Charge Alliance protocol page (confirms "New Functional Block on Bidirectional Charging" and "Support for ISO 15118-20 with bidirectional power transfer")
- Existing handler implementations in `03_Modules/` with explicit TODO comments for 2.1 gaps

**Confidence notes:**
- The message flow is reconstructed from the OCPP 2.1 type definitions, JSON schemas, and OCPP 2.0.1 patterns in the codebase. The actual OCPP 2.1 Part 2 specification document (use case descriptions K17-K21) was not directly available for verification, so the exact use case numbering and some flow details are MEDIUM confidence.
- The gap analysis is HIGH confidence -- based on direct code inspection of handlers, models, and TODO comments left by the development team.
- The `ChargingStateEnumType` in OCPP 2.1 does NOT include a `Discharging` value (only EVConnected, Charging, SuspendedEV, SuspendedEVSE, Idle). Discharge is indicated by the `operationMode` and negative power values, not a separate charging state. This is HIGH confidence from the JSON schema.

---

*Feature landscape analysis: 2026-03-26*
