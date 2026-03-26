# Domain Pitfalls: OCPP 2.1 V2X Discharge on CitrineOS

**Domain:** CSMS V2X/bidirectional power transfer support
**Researched:** 2026-03-26
**Overall confidence:** HIGH (based on direct codebase analysis + OCPP 2.1 specification knowledge)

## Critical Pitfalls

These are bugs or gaps in the current CitrineOS codebase that will cause V2X discharge to fail outright. Each was confirmed by reading the actual source code.

### Pitfall 1: OCPP 2.1 Request Validation Uses Response Schemas (BUG)

**What goes wrong:** The `OCPPValidator.validateOCPPRequest()` method validates incoming OCPP 2.1 requests against *response* schemas instead of request schemas. Line 144 of `OCPPValidator.ts` uses `OCPP2_1_CALL_RESULT_SCHEMA_RECORD` where it should use `OCPP2_1_CALL_SCHEMA_RECORD`. The import on line 13 never even imports the request schema record.

**Why it happens:** Likely a copy-paste error. The 2.0.1 case correctly uses `OCPP2_0_1_CALL_SCHEMA_RECORD` for requests, but the 2.1 case was written incorrectly.

**Consequences:** Every incoming OCPP 2.1 request from a charging station (TransactionEvent, MeterValues, NotifyEVChargingNeeds, etc.) is validated against the wrong schema. This can either:
- Silently accept malformed requests that should be rejected
- Reject valid requests if the response schema is more restrictive
- Mask V2X-specific field validation problems because the wrong schema is being checked

**Prevention:**
- Fix OCPPValidator line 144 to use `OCPP2_1_CALL_SCHEMA_RECORD`
- Add the missing import of `OCPP2_1_CALL_SCHEMA_RECORD`
- Add a unit test that validates a known-good 2.1 TransactionEventRequest with V2X fields

**Detection:** Sending a well-formed OCPP 2.1 TransactionEventRequest that should pass validation but gets unexpected behavior. Or sending a deliberately malformed request that should fail but passes.

**File:** `00_Base/src/interfaces/modules/OCPPValidator.ts` lines 13, 144

**Phase:** Must be fixed first, before any V2X flow testing.

---

### Pitfall 2: No TransactionEvent Handler for OCPP 2.1

**What goes wrong:** The TransactionEvent handler is registered for `[OCPPVersion.OCPP2_0_1]` only (line 283 of Transactions module), not for `OCPP_2_VER_LIST`. There is an explicit TODO at line 429: "Need a transaction event handler for OCPP 2.1 as we need to tweak or extend the transaction service for ocpp 2.1." When a 2.1 charger sends a TransactionEvent, no handler is invoked.

**Why it happens:** The 2.1 `TransactionEventRequest` has new fields not present in 2.0.1:
- `costDetails` (inline cost reporting)
- `transactionInfo.operationMode` (V2X operation mode: Idle, ChargingOnly, CentralSetpoint, ExternalSetpoint, ExternalLimits)
- `transactionInfo.tariffId` (inline tariff reference)
- `transactionInfo.transactionLimit` (cost/energy/time/SoC limits)
- `evseSleep` (EVSE sleep mode indicator)
- `preconditioningStatus`

The 2.0.1 handler's typed parameter `IMessage<OCPP2_0_1.TransactionEventRequest>` cannot handle these fields.

**Consequences:** V2X discharge transactions cannot start, update, or end through the normal OCPP 2.1 flow. The CSMS will not process any transaction events from a 2.1-connected station.

**Prevention:**
- Create a 2.1-specific TransactionEvent handler or extend the existing handler to accept both versions
- Ensure the handler processes `operationMode` and persists it on the Transaction model
- Handle the `Discharging` charging state (see Pitfall 3)

**Detection:** Connect a 2.1 station client, start a transaction -- the CSMS logs will show no handler was invoked or the message will be silently dropped.

**File:** `03_Modules/Transactions/src/module/module.ts` lines 283, 429

**Phase:** Must be addressed to enable any V2X transaction flow.

---

### Pitfall 3: DTO ChargingStateEnum Missing "Discharging" State

**What goes wrong:** The DTO-layer `ChargingStateEnumSchema` in `00_Base/src/interfaces/dto/types/enums.ts` defines only five states: `['Charging', 'EVConnected', 'SuspendedEV', 'SuspendedEVSE', 'Idle']`. OCPP 2.1 adds a sixth state: `'Discharging'`. The 2.1 protocol-level enum (`00_Base/src/ocpp/model/2.1/enums/index.ts` line 294) correctly includes `Discharging`, but the shared DTO enum does not.

**Why it happens:** The DTO enums were defined for OCPP 2.0.1 and were not updated when 2.1 support was added. The DTO layer is used by the database model (`Transaction.chargingState` is `DataType.STRING`) and repository queries.

**Consequences:**
- When a 2.1 charger reports `chargingState: "Discharging"` in a TransactionEvent, the DTO-layer Zod validation will reject it
- Even if validation is bypassed, queries like `readAllTransactionsByStationIdAndEvseAndChargingStates` use `OCPP2_0_1.ChargingStateEnumType[]` as the parameter type, so "Discharging" cannot be passed as a filter
- The CSMS has no way to distinguish discharge sessions from charge sessions at the data layer

**Prevention:**
- Add `'Discharging'` to `ChargingStateEnumSchema` in the DTO enums
- Verify no existing code assumes `chargingState` can only be one of the five original values
- Update any UI or API layer that displays or filters by charging state

**Detection:** Send a TransactionEvent with `chargingState: "Discharging"` -- the DTO validation will fail, or the state will be stored as a raw string that doesn't match any enum value.

**File:** `00_Base/src/interfaces/dto/types/enums.ts` line 51-57

**Phase:** Must be fixed before discharge flow testing.

---

### Pitfall 4: MeterValueUtils Only Tracks Import Energy, Ignores Export

**What goes wrong:** `MeterValueUtils.getTotalKwh()` calculates energy consumed by looking at three measurand types in strict priority order:
1. `Energy.Active.Import.Register` (register-based, cumulative)
2. `Energy.Active.Import.Interval` (interval-based, incremental)
3. `Energy.Active.Net` (net energy)

During V2X discharge, the EV sends energy *back* through the EVSE. The relevant measurands are:
- `Energy.Active.Export.Register` (cumulative energy exported by EV)
- `Energy.Active.Export.Interval` (incremental energy exported)

**MeterValueUtils has no methods to extract Export values.** It has `getRegisterValuesMap()`, `getIntervalValuesMap()`, and `getNetValuesMap()` -- all hardcoded to Import measurands. The only exception is `Energy.Active.Net`, which theoretically captures bidirectional flow, but many chargers don't report it.

**Consequences:**
- `totalKwh` on the Transaction model will remain 0 during a discharge session (or reflect only import energy if the session switched from charging to discharging)
- Cost calculations via `CostCalculator.calculateTotalCost()` use `totalKwh`, so discharge sessions will show $0 cost
- The CSMS cannot track how much energy was exported, which is critical for V2X settlement

**Prevention:**
- Add `getExportRegisterValuesMap()` and `getExportIntervalValuesMap()` methods
- Track import and export energy separately on the Transaction model (add `totalExportKwh` column)
- For net energy calculation, subtract export from import or use `Energy.Active.Net` when available
- Cost calculation must handle the asymmetry: discharged energy may need different pricing than consumed energy

**Detection:** Run a V2X discharge session, check the Transaction record -- `totalKwh` will be 0 or wrong.

**Files:**
- `00_Base/src/util/MeterValueUtils.ts` lines 94-110 (only Import measurands)
- `03_Modules/Transactions/src/module/TransactionService.ts` line 71 (calls getTotalKwh)
- `03_Modules/Transactions/src/module/CostCalculator.ts` line 41 (uses totalKwh)

**Phase:** Must be addressed for accurate discharge metering and billing.

---

### Pitfall 5: NotifyEVChargingNeeds Handler Rejects V2X/BPT Energy Transfer Modes

**What goes wrong:** The `_handleNotifyEVChargingNeeds` handler in SmartCharging (line 175) checks whether the request has AC or DC charging parameters:

```typescript
const hasAcOrDcChargingParameters =
  givenNeeds.dcChargingParameters !== null || givenNeeds.acChargingParameters !== null;
```

If this is false, the handler rejects the request. V2X sessions use `v2xChargingParameters` (not AC or DC parameters), so the check fails.

Additionally, the `matchedChargingType` validation only accepts `DC` or non-DC (AC) modes. It does not recognize BPT modes (`AC_BPT`, `DC_BPT`, `AC_BPT_DER`, `DC_ACDP_BPT`). A request with `requestedEnergyTransfer: "DC_BPT"` and `v2xChargingParameters` populated will be rejected.

The downstream `InternalSmartCharging.calculateChargingProfile()` further breaks: it has a switch statement on transfer modes (line 71-100) that only handles `AC_single_phase`, `AC_two_phase`, `AC_three_phase`, and `DC`. Any BPT mode hits the `default` case and throws `'Unsupported energy transfer mode'`.

**Consequences:** A V2X-capable EV that sends its charging needs (including discharge capability parameters) will receive a `Rejected` response. The CSMS cannot negotiate a V2X charging profile.

**Prevention:**
- Extend the handler to accept `v2xChargingParameters` alongside AC/DC parameters
- Extend `matchedChargingType` to recognize BPT transfer modes
- Add BPT cases to `InternalSmartCharging.calculateChargingProfile()` that use V2X parameters (min/max charge power, min/max discharge power, energy request values)
- Create charging profiles with `dischargeLimit` and `setpoint` fields

**Detection:** Send a `NotifyEVChargingNeeds` with `requestedEnergyTransfer: "DC_BPT"` and `v2xChargingParameters` populated -- the response will be `Rejected`.

**Files:**
- `03_Modules/SmartCharging/src/module/module.ts` lines 197-210
- `03_Modules/SmartCharging/src/module/smartCharging/InternalSmartCharging.ts` lines 71-100

**Phase:** Must be extended for V2X profile negotiation.

---

### Pitfall 6: ChargingNeeds Database Model Missing V2X Columns

**What goes wrong:** The `ChargingNeeds` Sequelize model only has columns for:
- `acChargingParameters` (JSONB)
- `dcChargingParameters` (JSONB)
- `departureTime` (DATE)
- `requestedEnergyTransfer` (STRING)
- `maxScheduleTuples` (INTEGER)

OCPP 2.1 adds these fields to `ChargingNeedsType` that have no corresponding database column:
- `v2xChargingParameters` (V2XChargingParametersType -- contains min/max charge/discharge power, energy requests including negative values)
- `derChargingParameters` (DERChargingParametersType -- DER control functions)
- `evEnergyOffer` (EVEnergyOfferType -- EV's energy offer with power and price schedules)
- `controlMode` (ControlModeEnumType -- ScheduledControl or DynamicControl)
- `mobilityNeedsMode` (MobilityNeedsModeEnumType)
- `availableEnergyTransfer` (array of EnergyTransferModeEnumType)

The `createChargingNeeds` repository method (line 192 of `ChargingProfile.ts`) uses `...chargingNeedsReq.chargingNeeds` spread, but since the model has no matching columns, V2X-specific data is silently discarded by Sequelize.

**Consequences:** Even if the handler is fixed to accept V2X needs, the data will not be persisted. The CSMS loses the EV's discharge capability information, making it impossible to create appropriate charging profiles later or audit what was negotiated.

**Prevention:**
- Add `v2xChargingParameters` (JSONB), `derChargingParameters` (JSONB), `evEnergyOffer` (JSONB), `controlMode` (STRING), `mobilityNeedsMode` (STRING), `availableEnergyTransfer` (JSONB) columns to the ChargingNeeds model
- Create a database migration for the new columns
- Update the ChargingNeeds DTO interface to include the new fields

**Detection:** Successfully persist a NotifyEVChargingNeeds request with V2X parameters, then query the database -- the V2X fields will be null/missing.

**Files:**
- `01_Data/src/layers/sequelize/model/ChargingProfile/ChargingNeeds.ts` (model definition)
- `01_Data/src/layers/sequelize/repository/ChargingProfile.ts` line 190-218 (create method)

**Phase:** Requires a database migration. Should be done alongside handler fixes.

---

### Pitfall 7: No Handler for NotifyAllowedEnergyTransfer (2.1-only Message)

**What goes wrong:** OCPP 2.1 introduces `NotifyAllowedEnergyTransfer` as a new CSMS-to-station message. The CSMS uses it to tell the station which energy transfer modes (including BPT/discharge modes) are allowed. No module in CitrineOS registers a handler for this action.

**Why it happens:** This message is entirely new in 2.1 -- there is no 2.0.1 equivalent to extend.

**Consequences:** The CSMS cannot communicate to the station which V2X modes are permitted. Without this, the station may not offer V2X discharge at all (per spec, the CSMS should respond to charging needs with allowed modes) or may default to charging-only.

**Prevention:**
- Add a handler in the SmartCharging or EVDriver module for `NotifyAllowedEnergyTransfer`
- Implement configuration for which BPT modes are allowed per station/EVSE
- The handler should send the message after boot notification or when V2X policy changes

**Detection:** Check module handler registrations for `NotifyAllowedEnergyTransfer` -- grep confirms no handler exists in any module.

**Phase:** Needed for proper V2X negotiation. Can be deferred for initial testing if the charging station assumes BPT is allowed.

## Moderate Pitfalls

### Pitfall 8: No MeterValues Handler for OCPP 2.1

**What goes wrong:** The MeterValues handler at line 431 is registered for `[OCPPVersion.OCPP2_0_1]` only. The TODO at line 502 confirms: "Need a meter event handler for OCPP 2.1 as we need to tweak or extend the transaction service for ocpp 2.1." OCPP 2.1 `MeterValuesRequest` has additional measurands (Display.*, Energy.Active.Setpoint.Interval, Energy.Active.Import.LocalGeneration.Register, etc.) that the 2.0.1 handler doesn't expect.

**Prevention:**
- Register a 2.1 MeterValues handler or extend the existing one to handle both versions
- Ensure the handler processes export-related measurands for discharge sessions

**File:** `03_Modules/Transactions/src/module/module.ts` lines 431, 502

---

### Pitfall 9: Cost Calculation Assumes Positive Energy Only

**What goes wrong:** `CostCalculator.calculateTotalCost()` computes `pricePerKwh * totalKwh`. During V2X discharge:
- `totalKwh` could be negative (if export exceeds import during a session)
- The cost should potentially be negative (CSMS paying the EV owner for exported energy)
- The simple `pricePerKwh` model has no concept of feed-in tariffs or buy-back rates

The `Money.of(tariff.pricePerKwh, tariff.currency).multiply(totalKwh)` will produce a negative cost if totalKwh is negative, but this is semantically wrong -- the discharge tariff rate should likely differ from the charging rate.

**Prevention:**
- Track import and export kWh separately
- Support separate tariff rates for charge vs. discharge
- Validate that `totalCost` in the TransactionEventResponse is correctly signed per OCPP 2.1 spec

**File:** `03_Modules/Transactions/src/module/CostCalculator.ts`

---

### Pitfall 10: ChargingProfile Mapper Uses 2.0.1 Types, Drops 2.1 Fields

**What goes wrong:** In the SmartCharging handler (line 247-248), after calculating a charging profile, the code stores it using:
```typescript
OCPP2_0_1_Mapper.ChargingProfileMapper.fromChargingProfileType(chargingProfile)
```
This maps a 2.1 `ChargingProfileType` through a 2.0.1 mapper. The 2.0.1 `ChargingSchedulePeriodType` has no `dischargeLimit`, `setpoint`, `limit_L2`, `limit_L3` fields. These V2X-critical fields are dropped during the mapping.

**Prevention:**
- Create a 2.1-specific mapper or update the existing mapper to preserve 2.1 fields
- Ensure the ChargingProfile database model can store discharge limits and setpoints

**File:** `03_Modules/SmartCharging/src/module/module.ts` line 247-248

---

### Pitfall 11: Transaction Model Lacks V2X-Specific Fields

**What goes wrong:** The `Transaction` model stores `chargingState` as a STRING, `totalKwh` as DECIMAL, and has no fields for:
- `operationMode` (which V2X mode is active)
- `totalExportKwh` (energy discharged)
- Energy direction tracking
- `transactionLimit` (cost/energy/time/SoC limits from 2.1)

The `createOrUpdateTransactionByTransactionEventAndStationId` repository method (line 126 of TransactionEvent.ts) accepts `OCPP2_0_1.TransactionEventRequest` and spreads `value.transactionInfo` into the update -- 2.1-only fields like `operationMode` and `tariffId` (which does exist on the model) will be partially handled but `transactionLimit` will be dropped.

**Prevention:**
- Add `operationMode` column to Transaction model
- Add `totalExportKwh` column for tracking discharged energy
- Create a 2.1-specific version of `createOrUpdateTransactionByTransactionEventAndStationId` or modify the existing one

**Files:**
- `01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts`
- `01_Data/src/layers/sequelize/repository/TransactionEvent.ts` line 126

---

### Pitfall 12: MeasurandEnum in DTO Layer Missing 2.1 Measurands

**What goes wrong:** The `MeasurandEnumSchema` in the DTO layer (`00_Base/src/interfaces/dto/types/enums.ts` line 267) defines measurands matching OCPP 2.0.1. OCPP 2.1 adds several new measurands critical for V2X:
- `Display.PresentSOC`, `Display.TargetSOC`, `Display.MinimumSOC`, `Display.MaximumSOC`
- `Display.BatteryEnergyCapacity`
- `Energy.Active.Setpoint.Interval`
- `Energy.Active.Import.LocalGeneration.Register`
- `Power.Active.Net` (not in the DTO enum but used for bidirectional flow direction)

If meter values with these measurands are persisted through the DTO layer, they may fail Zod validation or be stored with an unrecognized measurand string.

**Prevention:**
- Synchronize `MeasurandEnumSchema` with the OCPP 2.1 enum
- Verify that the SampledValue model can store any measurand string (check DB column constraints)

**File:** `00_Base/src/interfaces/dto/types/enums.ts` lines 267-295

## Minor Pitfalls

### Pitfall 13: SmartCharging Module Has Zero Test Coverage

**What goes wrong:** The SmartCharging module has no test directory and no tests. The `InternalSmartCharging` class, which calculates charging profiles, is completely untested. Any modifications to support V2X profiles will have no safety net.

**Prevention:** Write tests for `calculateChargingProfile()` with BPT transfer modes before modifying the implementation.

---

### Pitfall 14: Negative Signed Values in Database Columns

**What goes wrong:** The Transaction model uses `DataType.DECIMAL` for `totalKwh` and `meterStart`. If V2X sessions produce negative net energy values, the database column must accept negative values. While `DECIMAL` type in PostgreSQL supports negatives, any application-layer validation or UI that assumes non-negative energy values will break.

**Prevention:** Verify no check constraints or application validations assume `totalKwh >= 0`. Add explicit documentation that negative values are valid for V2X sessions.

---

### Pitfall 15: ChargingSchedulePeriod Storage May Not Support Discharge Fields

**What goes wrong:** If the ChargingProfile/ChargingSchedule database model was built for 2.0.1, it may not have columns for the new 2.1 `ChargingSchedulePeriodType` fields: `dischargeLimit`, `dischargeLimit_L2`, `dischargeLimit_L3`, `setpoint`, `setpoint_L2`, `setpoint_L3`, `limit_L2`, `limit_L3`, `evseSleep`, `operationMode`, `preconditioningRequest`. These fields are essential for V2X charging profiles.

**Prevention:** Audit the ChargingSchedulePeriod model. If stored as JSONB, verify the schema accepts the new fields. If stored as individual columns, add migrations.

---

### Pitfall 16: GetCompositeSchedule Missing for 2.1

**What goes wrong:** There is a TODO at line 514 of SmartCharging module: "2.1 GetCompositeSchedule - We need to add a specific handler for 2.1 or we need to change how we do our mapping / create a mapper for 2.1." The composite schedule in 2.1 includes discharge limits and setpoints. Without a 2.1 handler, the CSMS cannot correctly report the merged schedule to operators.

**Prevention:** Implement a 2.1-specific GetCompositeSchedule response handler that includes discharge fields.

**File:** `03_Modules/SmartCharging/src/module/module.ts` line 514

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Priority |
|-------------|---------------|------------|----------|
| Schema/Validation | Pitfall 1: Wrong schema record for 2.1 request validation | Fix OCPPValidator.ts line 144 import and assignment | P0 - blocks everything |
| Transaction Handling | Pitfall 2: No 2.1 TransactionEvent handler | Create or extend handler with 2.1 type support | P0 - blocks discharge flow |
| Transaction Handling | Pitfall 3: Missing "Discharging" in DTO enum | Add to ChargingStateEnumSchema | P0 - blocks discharge state |
| Meter Values | Pitfall 4: Only Import measurands tracked | Add Export measurand extraction to MeterValueUtils | P1 - wrong energy accounting |
| Smart Charging | Pitfall 5: BPT modes rejected by NotifyEVChargingNeeds | Extend handler and calculateChargingProfile for BPT | P1 - blocks V2X negotiation |
| Data Model | Pitfall 6: ChargingNeeds model missing V2X columns | Add columns + migration | P1 - data loss |
| Smart Charging | Pitfall 7: No NotifyAllowedEnergyTransfer handler | Add handler in SmartCharging module | P2 - can defer for initial testing |
| Meter Values | Pitfall 8: No 2.1 MeterValues handler | Register handler for OCPP 2.1 | P1 - blocks meter data |
| Billing | Pitfall 9: Cost assumes positive energy | Add discharge tariff support | P2 - billing accuracy |
| Data Model | Pitfall 10: 2.0.1 mapper drops 2.1 profile fields | Create 2.1 mapper | P1 - data loss |
| Data Model | Pitfall 11: Transaction model lacks V2X fields | Add operationMode, totalExportKwh | P1 - state tracking |
| Data Model | Pitfall 12: MeasurandEnum missing 2.1 values | Synchronize with 2.1 spec | P1 - validation failures |

## Suggested Fix Ordering

Based on dependency analysis, the fixes should be applied in this order:

1. **Foundation fixes** (unblock everything):
   - Fix OCPPValidator (Pitfall 1)
   - Add "Discharging" to ChargingStateEnum (Pitfall 3)
   - Add missing 2.1 measurands to MeasurandEnum (Pitfall 12)

2. **Handler registration** (enable message flow):
   - Register 2.1 TransactionEvent handler or widen to OCPP_2_VER_LIST (Pitfall 2)
   - Register 2.1 MeterValues handler (Pitfall 8)

3. **Data model expansion** (persist V2X data):
   - Add V2X columns to ChargingNeeds model + migration (Pitfall 6)
   - Add operationMode/totalExportKwh to Transaction model + migration (Pitfall 11)

4. **Business logic** (correct V2X behavior):
   - Extend MeterValueUtils for Export measurands (Pitfall 4)
   - Extend NotifyEVChargingNeeds for BPT modes (Pitfall 5)
   - Create 2.1 ChargingProfile mapper (Pitfall 10)

5. **Deferred** (can test without):
   - NotifyAllowedEnergyTransfer handler (Pitfall 7)
   - Discharge tariff support (Pitfall 9)
   - GetCompositeSchedule for 2.1 (Pitfall 16)

## Sources

All findings were confirmed by reading source code in the `feature/ocpp-2.1` branch:
- `00_Base/src/interfaces/modules/OCPPValidator.ts` -- validator bug (HIGH confidence)
- `03_Modules/Transactions/src/module/module.ts` -- handler registrations (HIGH confidence)
- `00_Base/src/interfaces/dto/types/enums.ts` -- DTO enum gaps (HIGH confidence)
- `00_Base/src/util/MeterValueUtils.ts` -- import-only measurands (HIGH confidence)
- `03_Modules/SmartCharging/src/module/module.ts` -- NotifyEVChargingNeeds handler (HIGH confidence)
- `03_Modules/SmartCharging/src/module/smartCharging/InternalSmartCharging.ts` -- profile calculation (HIGH confidence)
- `01_Data/src/layers/sequelize/model/ChargingProfile/ChargingNeeds.ts` -- model schema (HIGH confidence)
- `01_Data/src/layers/sequelize/repository/TransactionEvent.ts` -- transaction persistence (HIGH confidence)
- `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts` -- V2XChargingParametersType spec (HIGH confidence)
- `00_Base/src/ocpp/model/2.1/types/SetChargingProfileRequest.ts` -- dischargeLimit/setpoint fields (HIGH confidence)
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- 2.1 enums including Discharging, BPT modes (HIGH confidence)
