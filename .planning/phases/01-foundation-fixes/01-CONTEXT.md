# Phase 1: Foundation Fixes - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the base layer so it correctly validates OCPP 2.1 requests, accepts V2X-related enum values (including "Discharging" charging state and V2X measurands), and accounts for bidirectional energy in MeterValueUtils. This phase only touches `00_Base` — no module handler changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User deferred all technical decisions to Claude. The following areas are flexible:

- **Energy calculation approach:** Whether `getTotalKwh` returns net energy (import - export) or whether to add separate `getExportTotalKwh()` method alongside existing import-only logic. Choose based on how downstream modules (Transactions, SmartCharging) consume energy data.
- **DTO enum sync scope:** Minimum viable approach — add only the values needed for V2X discharge flow to work (e.g., "Discharging" to ChargingStateEnumSchema, any missing V2X measurands). Full 2.1 enum audit is out of scope for this phase.
- **Validator fix testing:** Fix the one-liner bug in OCPPValidator.ts:144 (change `OCPP2_1_CALL_RESULT_SCHEMA_RECORD` to `OCPP2_1_CALL_SCHEMA_RECORD`). Add unit test coverage if straightforward, but don't over-invest — the fix is a single import/reference change.
- **MessageStateEnumSchema:** If "Discharging" is needed there too (for display messages), include it. Otherwise skip.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Validation Bug
- `00_Base/src/interfaces/modules/OCPPValidator.ts` — Lines 13 (import) and 144 (bug: uses CALL_RESULT instead of CALL schema for 2.1 requests). Line 220 is the CALL_RESULT validation and is correct.

### DTO Enums
- `00_Base/src/interfaces/dto/types/enums.ts` — ChargingStateEnumSchema (line 51, missing "Discharging"), MeasurandEnumSchema (line 267, already has Export measurands but may be missing 2.1-specific ones)
- `00_Base/src/ocpp/model/2.1/enums/index.ts` — Authoritative OCPP 2.1 enum definitions (ChargingStateEnumType at line 202 includes "Discharging" at line 294, MeasurandEnumType has full 2.1 measurand list)

### Energy Accounting
- `00_Base/src/util/MeterValueUtils.ts` — `getTotalKwh()` at line 27, currently only reads Import measurands
- `00_Base/src/ocpp/rpc/types.ts` — Union types for MeterValueType, ChargingStateEnumType (line 34)

### OCPP 2.1 Schemas (authoritative for validation)
- `00_Base/src/ocpp/model/2.1/schemas/TransactionEventRequest.json` — ChargingStateEnumType definition includes "Discharging" at line 10
- `00_Base/src/ocpp/model/2.1/schemas/` — All OCPP 2.1 JSON schemas for request/response validation

### Research
- `.planning/research/STACK.md` — Protocol-level component gaps
- `.planning/research/PITFALLS.md` — P1 (validator bug), P3 (Discharging enum), P4 (MeterValueUtils), P12 (DTO measurands)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MeterValueUtils` class already has `getImportRegisterValuesMap()`, `getImportIntervalValuesMap()` — follow same pattern for Export methods
- `OCPPValidator` has separate methods for Call vs CallResult validation — fix is isolated to the Call validation branch

### Established Patterns
- DTO enums in `enums.ts` use Zod `z.enum()` schemas with corresponding exported enum objects and inferred types
- MeterValueUtils uses static methods operating on `MeterValueDto[]` arrays
- OCPP protocol enums are auto-generated in `00_Base/src/ocpp/model/{version}/enums/index.ts` — DTO enums in `dto/types/enums.ts` are manually maintained and may not have all values

### Integration Points
- `MeterValueUtils` is used by `TransactionService.recalculateTotalKwh()` in Transactions module (Phase 2 dependency)
- `ChargingStateEnumSchema` is used in `TransactionTypeSchema` (dto/types/transaction.type.ts:10)
- `MeasurandEnumSchema` is used for meter value validation in DTO layer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User wants these fixes done efficiently so they can move to V2X module handlers in Phase 2.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-fixes*
*Context gathered: 2026-03-26*
