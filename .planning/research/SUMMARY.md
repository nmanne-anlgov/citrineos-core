# Research Summary: CitrineOS OCPP 2.1 V2X Discharge Testing

**Synthesized:** 2026-03-26
**Confidence:** HIGH -- all findings derived from direct codebase inspection of the `feature/ocpp-2.1` branch

---

## Executive Summary

CitrineOS is a well-structured OCPP CSMS that already has the full protocol layer for OCPP 2.1 V2X/bidirectional power transfer: the JSON schemas, TypeScript types, enum definitions, and WebSocket endpoint on port 8083 with `ocpp2.1` subprotocol are all present and operational. The gap is not infrastructure -- it is that the business logic handlers, data models, and utility functions were never updated to exercise the V2X portions of those types. The core handlers for TransactionEvent and MeterValues are explicitly stubbed out for OCPP 2.1 (with TODO comments in the source), BPT energy transfer modes cause an exception in the SmartCharging profile calculator, and the Export measurands produced during discharge are completely invisible to the MeterValueUtils energy accounting layer.

There is also one pre-existing bug that will silently corrupt validation for all OCPP 2.1 traffic: the OCPPValidator uses the response schema record to validate incoming requests, instead of the request schema record. This must be fixed before any end-to-end testing is meaningful.

The implementation strategy is surgical extension, not restructuring. No new modules, packages, or infrastructure are needed. The work falls into three parallel tracks after a foundation pass: (1) SmartCharging V2X profile negotiation, (2) Transaction handler and meter value recording, and (3) the EVDriver NotifyAllowedEnergyTransfer message. The entire set of table-stakes changes needed to validate V2X discharge end-to-end is bounded and well-identified.

---

## Key Findings

### From STACK.md -- Technology Layer

- The `ocpp2.1` WebSocket subprotocol, schema validation, and action routing are all working. No infrastructure changes are needed.
- All V2X TypeScript types (`V2XChargingParametersType`, `EnergyTransferModeEnumType` BPT values, `OperationModeEnumType`, Export measurands) are already generated and importable from `@citrineos/base`.
- The OCPP 2.1 V2X discharge message flow requires 9 messages; 6 of them have gaps in the current implementation (TransactionEvent Started/Updated/Ended, NotifyEVChargingNeeds, NotifyAllowedEnergyTransfer, MeterValues).
- Handler extension strategy: create a separate `_handleTransactionEvent21` (different field signatures); extend MeterValues handler to `OCPP_2_VER_LIST` (compatible types); add NotifyAllowedEnergyTransfer to EVDriver module.
- All V2X parameters should be stored as JSONB columns -- consistent with how `acChargingParameters` and `dcChargingParameters` are stored.
- No new npm dependencies or database engines required.

### From FEATURES.md -- Feature Landscape

**Table Stakes (all 7 required for end-to-end validation):**

| # | Feature | Current State |
|---|---------|---------------|
| T1 | Accept BPT energy transfer modes in NotifyEVChargingNeeds | BROKEN -- handler rejects at lines 197-210 |
| T2 | Process V2XChargingParametersType | MISSING -- only AC/DC params checked |
| T3 | Discharge-aware ChargingProfile (dischargeLimit, setpoint) | MISSING -- InternalSmartCharging throws on BPT |
| T4 | OCPP 2.1 TransactionEvent handler | MISSING -- explicit TODO at line 429 |
| T5 | Store operationMode on Transaction | MISSING -- column does not exist |
| T6 | Handle Energy.Active.Export measurands | BROKEN -- MeterValueUtils ignores Export |
| T7 | OCPP 2.1 MeterValues handler | MISSING -- explicit TODO at line 502 |

**Recommended deferred differentiators:** DynamicControl real-time setpoints (D1), discharge cost/compensation calculation (D4), DER/grid services (D7-D9).

**Good candidates for inclusion alongside T2:** V2X parameter storage in DB (D6) and GetCompositeSchedule 2.1 handler (D11) -- both are low incremental cost.

### From ARCHITECTURE.md -- Component Boundaries

- CitrineOS's three-module split (Transactions, SmartCharging, EVDriver) maps naturally to V2X discharge. No new modules needed.
- **Transactions module** owns TransactionEvent lifecycle and MeterValues -- needs two new `@AsHandler([OCPPVersion.OCPP2_1], ...)` methods.
- **SmartCharging module** owns NotifyEVChargingNeeds and profile calculation -- needs BPT cases added to `calculateChargingProfile()` switch and V2X parameter check in the handler.
- **EVDriver module** needs `NotifyAllowedEnergyTransfer` -- a new OCPP 2.1 CSMS-to-CS message with no handler anywhere in the codebase. Requires a MessageApi endpoint, a response handler, and a config entry.
- **MeterValueUtils** (`00_Base`) -- foundational utility that must be extended to add `getExportRegisterValuesMap()` and update `getTotalKwh()` for net energy calculation.
- Config-driven action routing is critical: `NotifyAllowedEnergyTransfer` must be added to `evdriver.responses` in `docker.ts`, `local.ts`, and `swarm.docker.ts` or the RabbitMQ subscription will never be created and the handler will never fire.
- Build order follows CitrineOS's layer hierarchy: `00_Base` / `01_Data` first, then parallel tracks in `03_Modules`, then `Server` config last.

### From PITFALLS.md -- Implementation Risks

**Critical bugs confirmed by code inspection:**

| # | Pitfall | File | Impact |
|---|---------|------|--------|
| P1 | OCPPValidator uses response schema to validate requests | `00_Base/src/interfaces/modules/OCPPValidator.ts:144` | All OCPP 2.1 request validation is silently wrong |
| P2 | No TransactionEvent handler for OCPP 2.1 | `Transactions/module.ts:429` | No V2X transaction can start/update/end |
| P3 | DTO ChargingStateEnum missing "Discharging" | `00_Base/.../dto/types/enums.ts:51` | Discharge state triggers Zod validation failure |
| P4 | MeterValueUtils ignores Export measurands | `00_Base/.../MeterValueUtils.ts:94` | totalKwh always 0 for discharge sessions |
| P5 | NotifyEVChargingNeeds rejects BPT modes | `SmartCharging/module.ts:197-210` | V2X profile negotiation blocked |
| P6 | ChargingNeeds model missing V2X columns | `01_Data/.../ChargingNeeds.ts` | V2X params silently discarded on persist |

**Additional confirmed gaps (moderate priority):**

| # | Pitfall | Priority |
|---|---------|----------|
| P8 | No MeterValues handler for OCPP 2.1 | P1 |
| P10 | ChargingProfile mapper uses 2.0.1 types, drops dischargeLimit/setpoint | P1 |
| P11 | Transaction model lacks operationMode, totalExportKwh | P1 |
| P12 | DTO MeasurandEnum missing 2.1 V2X measurands | P1 |

---

## Critical Gaps Identified

These are the showstoppers. Every one must be resolved before a V2X discharge session can complete successfully.

### Gap 1: OCPPValidator uses wrong schema record (P0)

**File:** `00_Base/src/interfaces/modules/OCPPValidator.ts` line 144
**Fix:** Change `OCPP2_1_CALL_RESULT_SCHEMA_RECORD` to `OCPP2_1_CALL_SCHEMA_RECORD` and add the missing import.
**Why first:** Without this fix, any test result is unreliable -- requests are validated against response schemas, which can silently pass malformed payloads or reject valid ones.

### Gap 2: OCPP 2.1 TransactionEvent handler does not exist (P0)

**File:** `03_Modules/Transactions/src/module/module.ts` line 429
**Fix:** Create `_handleTransactionEvent21` decorated with `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.TransactionEvent)`.
**Why critical:** Without this, no OCPP 2.1 station can create, update, or end a transaction.

### Gap 3: "Discharging" chargingState not in DTO enum (P0)

**File:** `00_Base/src/interfaces/dto/types/enums.ts` lines 51-57
**Fix:** Add `'Discharging'` to `ChargingStateEnumSchema`.
**Why critical:** A TransactionEvent carrying `chargingState: "Discharging"` will fail Zod validation and be rejected before the handler is reached.

### Gap 4: NotifyEVChargingNeeds handler rejects BPT/V2X modes (P1)

**Files:** `SmartCharging/module.ts:197-210`, `InternalSmartCharging.ts:71-100`
**Fix:** Add `v2xChargingParameters` to the parameter presence check; add `AC_BPT`, `DC_BPT`, `AC_BPT_DER`, `DC_ACDP_BPT` cases to the profile calculator switch statement.
**Why critical:** Without this, the EV's discharge capability is rejected and no profile can be negotiated.

### Gap 5: MeterValueUtils ignores Export measurands (P1)

**File:** `00_Base/src/util/MeterValueUtils.ts`
**Fix:** Add `getExportRegisterValuesMap()`, `getExportIntervalValuesMap()`, update `getTotalKwh()` for net energy.
**Why critical:** totalKwh remains 0 during discharge; energy accounting and cost calculation are wrong.

### Gap 6: No OCPP 2.1 MeterValues handler (P1)

**File:** `03_Modules/Transactions/src/module/module.ts` line 502 (TODO)
**Fix:** Create `_handleMeterValues21` or widen existing handler to `OCPP_2_VER_LIST`.
**Why critical:** Periodic discharge meter values from 2.1 stations are silently dropped.

### Gap 7: ChargingProfile mapper drops dischargeLimit and setpoint (P1)

**File:** `SmartCharging/module.ts:247-248`
**Fix:** Create or extend a 2.1-aware ChargingProfile mapper that preserves V2X schedule period fields.
**Why critical:** Even if a correct bidirectional profile is calculated, it is immediately stripped of its discharge fields before being stored or sent.

### Gap 8: Data model gaps require migrations (P1)

Three models need new columns and accompanying Sequelize migrations:
- `Transaction`: add `operationMode` (STRING), `totalExportKwh` (DECIMAL)
- `ChargingNeeds`: add `v2xChargingParameters` (JSONB), `controlMode` (STRING), `mobilityNeedsMode` (STRING), `availableEnergyTransfer` (JSONB), `evEnergyOffer` (JSONB)
- DTO MeasurandEnum: add 2.1 V2X measurands (`Display.*`, `Energy.Active.Setpoint.Interval`, etc.)

### Gap 9: NotifyAllowedEnergyTransfer not implemented anywhere (P2)

**Fix:** Add handler in EVDriver module, new MessageApi endpoint, and add `OCPP_CallAction.NotifyAllowedEnergyTransfer` to `evdriver.responses` in all config files.
**Note:** Can defer for initial testing if the charging station simulator assumes BPT is permitted without an explicit CSMS confirmation.

---

## Recommended Stack / Approach

**Use the existing stack with targeted fixes. No new dependencies or structural changes.**

| Layer | Technology | V2X Action |
|-------|-----------|------------|
| WebSocket | `ws` library, port 8083, `ocpp2.1` subprotocol | No change |
| Schema validation | JSON Schema, `OCPP2_1_CALL_SCHEMA_RECORD` | Fix OCPPValidator to use correct record |
| TypeScript types | Auto-generated from OCA schemas in `00_Base` | No change -- all V2X types exist |
| Message routing | `@AsHandler` decorators, RabbitMQ via EventGroup | Add 2.1-specific handlers; add config entries |
| Database | PostgreSQL, Sequelize, JSONB for complex types | Migrations to add V2X columns |
| Energy accounting | MeterValueUtils | Add Export measurand methods |
| Smart charging | `ISmartCharging` / `InternalSmartCharging` | Add BPT cases and discharge profile generation |

**Handler strategy:**
- TransactionEvent: new `_handleTransactionEvent21` (type signatures differ)
- MeterValues: extend existing to `OCPP_2_VER_LIST` or new handler (compatible JSONB storage)
- NotifyEVChargingNeeds: existing handler + internal logic change (already uses `OCPP_2_VER_LIST`)
- NotifyAllowedEnergyTransfer: new handler + new MessageApi in EVDriver/2.1/

---

## Implementation Order

The dependency chain flows from base layers upward:

```
Step 1 (Foundation -- unblocks all testing):
  - Fix OCPPValidator request schema bug
  - Add "Discharging" to ChargingStateEnumSchema DTO
  - Add 2.1 V2X measurands to MeasurandEnumSchema DTO
  - Add Export measurand methods to MeterValueUtils

Step 2 (Data models -- parallel, must complete before module work):
  - Add operationMode, totalExportKwh to Transaction model + migration
  - Add v2xChargingParameters and related columns to ChargingNeeds model + migration

Step 3 (Module handlers -- two parallel tracks after Steps 1-2):

  Track A: SmartCharging V2X
    - Add v2xChargingParameters check to _handleNotifyEVChargingNeeds
    - Add BPT cases to InternalSmartCharging.calculateChargingProfile()
    - Create 2.1-aware ChargingProfile mapper (preserve dischargeLimit, setpoint)

  Track B: Transaction Handlers
    - Create _handleTransactionEvent21 (operationMode, costDetails, 2.1 fields)
    - Create _handleMeterValues21 (Export measurands, bidirectional energy)
    - Update TransactionService.recalculateTotalKwh() for net energy

Step 4 (EVDriver + NotifyAllowedEnergyTransfer):
  - Add response handler for NotifyAllowedEnergyTransfer
  - Create 03_Modules/EVDriver/src/module/2.1/MessageApi.ts
  - Add OCPP_CallAction.NotifyAllowedEnergyTransfer to evdriver.responses in all config files

Step 5 (Integration):
  - End-to-end V2X discharge flow test (simulator or physical station)
  - Verify totalKwh correctly reflects exported energy
  - Verify ChargingProfile persisted with dischargeLimit/setpoint fields intact
```

**Feature implementation order (from FEATURES.md):**
```
T5 (operationMode column) -> T4 (2.1 TransactionEvent handler)
T1 (accept BPT modes) -> T2 (process V2X params) -> T3 (discharge ChargingProfile)
T6 (export measurands) -> T7 (2.1 MeterValues handler)
```

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| OCPPValidator bug masks other problems | Critical | Confirmed | Fix first, add unit test for 2.1 request validation |
| ChargingProfile mapper silently drops discharge fields | High | Confirmed | Audit mapper output in tests; create 2.1 mapper before end-to-end test |
| V2X energy accounting incorrect (totalKwh=0) | High | Confirmed | Add Export measurands to MeterValueUtils; verify in integration test |
| Database migration conflicts with existing data | Medium | Low | Use nullable columns; test migration on populated DB |
| SmartCharging has zero test coverage | Medium | Confirmed | Write tests for calculateChargingProfile() BPT cases before implementation |
| Negative totalKwh in cost calculation | Medium | Medium | Verify CostCalculator handles negative values; document semantics |
| NotifyAllowedEnergyTransfer not in config | Medium | Confirmed | Easy fix; add to all three config files atomically |
| OCPP 2.1 spec nuances (use case K17 family) | Low | Low | JSON schemas are authoritative; test with real station or EVerest simulator |

**Highest-priority risk to sequence around:** The OCPPValidator bug (Pitfall 1) means that test results before the fix are unreliable. Fix this before any integration testing begins.

**Second-order risk:** The ChargingProfile mapper issue (Pitfall 10) is subtle -- the SmartCharging handler can correctly calculate a bidirectional profile but then immediately discard `dischargeLimit` and `setpoint` when it stores the profile via the 2.0.1 mapper. This would produce a test that appears to work (profile sent) but stores garbage in the database.

---

## Open Questions

These questions should be resolved during planning/requirements definition before implementation begins.

1. **Energy accounting semantics for mixed sessions:** If an EV charges for 10 kWh and discharges for 4 kWh in a single session, should `totalKwh` be 6 (net), or should there be separate `totalImportKwh: 10` and `totalExportKwh: 4` columns? The billing/reporting choice drives the data model migration scope.

2. **operationMode transition handling:** When the EV switches from charging to discharging mid-session (a `TransactionEvent(Updated)` with `triggerReason: OperationModeChanged`), what does the CSMS need to do? Recalculate the profile? Notify any external system? This determines how much logic goes into the 2.1 TransactionEvent handler.

3. **NotifyAllowedEnergyTransfer trigger conditions:** When should the CSMS proactively send `NotifyAllowedEnergyTransfer`? Is it always triggered by a preceding `NotifyEVChargingNeeds`, or does it also need to be sent at session start or on policy change? This determines the MessageApi design.

4. **EVerest simulator availability:** The EVerest OCPP 2.1 stack is referenced in the codebase. Is it available and configured for integration testing? Using a hardware station for initial V2X testing adds risk due to station firmware variability.

5. **ChargingSchedulePeriod storage format:** The ChargingSchedulePeriod model audit was flagged but not completed. If schedule periods are stored as JSONB blobs, the `dischargeLimit`/`setpoint` fields will persist correctly without migration. If they are stored as individual columns, migrations are required. This needs confirmation before the SmartCharging track begins.

6. **Discharge profile generation algorithm scope:** For the initial validation goal, is a simple max-discharge-power profile (set `dischargeLimit` to `maxDischargePower` from V2XChargingParameters) sufficient? Or does the profile calculator need to implement constraint-based optimization? The answer determines the complexity of the `calculateChargingProfile()` BPT case.

7. **Cost calculation for V2G sessions:** Is discharge cost/compensation in scope for this validation effort? The research recommendation is to defer (anti-feature), but if it is in scope, it requires a significant extension to the tariff model.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|-----------|-------|
| Gap identification | HIGH | All 7 table-stakes gaps confirmed by direct code inspection; TODO comments in source confirm developer intent |
| Bug identification | HIGH | OCPPValidator bug confirmed by reading lines 13 and 144; enum gaps confirmed by reading DTO files |
| Implementation approach | HIGH | Follows existing patterns (version-specific handlers, JSONB columns, config-driven routing) already used throughout codebase |
| Message flow semantics | MEDIUM | Derived from JSON schemas and type definitions; full OCPP 2.1 Part 2 use case documents (K17 family) not directly available |
| Test coverage risk | HIGH | SmartCharging has zero tests -- confirmed by codebase inspection |
| Implementation effort sizing | MEDIUM | Complexity estimates based on code reading; actual effort depends on edge cases discovered during implementation |

---

## Sources

All findings are from direct codebase inspection of the `feature/ocpp-2.1` branch (HIGH confidence):

- `00_Base/src/interfaces/modules/OCPPValidator.ts` -- validation bug
- `00_Base/src/interfaces/dto/types/enums.ts` -- DTO enum gaps
- `00_Base/src/util/MeterValueUtils.ts` -- Import-only energy tracking
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- all V2X enums confirmed present
- `00_Base/src/ocpp/model/2.1/types/` -- all V2X TypeScript types confirmed present
- `00_Base/src/ocpp/model/2.1/schemas/` -- all V2X JSON schemas confirmed present
- `03_Modules/Transactions/src/module/module.ts` -- handler registrations (TODO at lines 429, 502)
- `03_Modules/SmartCharging/src/module/module.ts` -- NotifyEVChargingNeeds handler gaps
- `03_Modules/SmartCharging/src/module/smartCharging/InternalSmartCharging.ts` -- BPT mode exception
- `03_Modules/EVDriver/src/module/module.ts` -- NotifyAllowedEnergyTransfer absence confirmed
- `01_Data/src/layers/sequelize/model/ChargingProfile/ChargingNeeds.ts` -- missing V2X columns
- `01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts` -- missing operationMode
- `Server/src/config/envs/docker.ts` -- module action routing, NotifyAllowedEnergyTransfer absence confirmed
- OCPP 2.1 type comments referencing ISO 15118-2 and ISO 15118-20 mappings
