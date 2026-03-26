# Phase 1: Foundation Fixes - Research

**Researched:** 2026-03-26
**Domain:** OCPP 2.1 validation infrastructure, DTO enum synchronization, bidirectional energy accounting
**Confidence:** HIGH

## Summary

Phase 1 addresses five requirements (VALID-01 through VALID-03, ENRGY-01 through ENRGY-02) in `00_Base` -- the lowest-level package with no internal dependencies. All fixes are isolated to three files plus one JSON schema, with existing test infrastructure (Vitest) already covering two of the three files.

The most critical fix is VALID-01: `OCPPValidator.ts` line 144 uses the CALL_RESULT schema record instead of the CALL schema record for OCPP 2.1 requests. This one-line bug (plus a missing import) means every incoming OCPP 2.1 request is validated against the wrong schema. Until this is fixed, all 2.1 message processing is unreliable.

The DTO enum fixes (VALID-02, VALID-03) require adding values to Zod enum schemas. A critical finding from this research is that "Discharging" is NOT present in the ChargingStateEnumType in THREE places that all need updating: (1) the DTO `ChargingStateEnumSchema` in `enums.ts`, (2) the TypeScript protocol enum in `00_Base/src/ocpp/model/2.1/enums/index.ts`, and (3) the JSON schema `TransactionEventRequest.json`. The CONTEXT.md referenced line 294 of `enums/index.ts` as having "Discharging" in ChargingStateEnumType, but that line is actually in `MessageStateEnumType`. The OCPP 2.1 JSON schemas only include "Discharging" in MessageStateEnumType (for display messages), not ChargingStateEnumType. All three locations must be updated to satisfy VALID-02.

**Primary recommendation:** Fix VALID-01 first (it blocks all 2.1 testing), then batch the enum updates (VALID-02, VALID-03), then implement MeterValueUtils export energy handling (ENRGY-01, ENRGY-02). All work is in `00_Base`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- user deferred all technical decisions to Claude.

### Claude's Discretion
- **Energy calculation approach:** Whether `getTotalKwh` returns net energy (import - export) or whether to add separate `getExportTotalKwh()` method alongside existing import-only logic. Choose based on how downstream modules (Transactions, SmartCharging) consume energy data.
- **DTO enum sync scope:** Minimum viable approach -- add only the values needed for V2X discharge flow to work (e.g., "Discharging" to ChargingStateEnumSchema, any missing V2X measurands). Full 2.1 enum audit is out of scope for this phase.
- **Validator fix testing:** Fix the one-liner bug in OCPPValidator.ts:144 (change `OCPP2_1_CALL_RESULT_SCHEMA_RECORD` to `OCPP2_1_CALL_SCHEMA_RECORD`). Add unit test coverage if straightforward, but don't over-invest -- the fix is a single import/reference change.
- **MessageStateEnumSchema:** If "Discharging" is needed there too (for display messages), include it. Otherwise skip.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VALID-01 | OCPPValidator uses correct request schema record for OCPP 2.1 message validation (fix bug at OCPPValidator.ts:144) | Bug confirmed: line 144 uses `OCPP2_1_CALL_RESULT_SCHEMA_RECORD`, import on line 13 is missing `OCPP2_1_CALL_SCHEMA_RECORD`. Fix requires 2 lines changed. Existing test file at `00_Base/test/modules/OCPPValidator.test.ts` can be extended. |
| VALID-02 | ChargingState DTO enum includes "Discharging" value for V2X sessions | Three locations need updating: DTO enum (`enums.ts:51`), protocol TypeScript enum (`2.1/enums/index.ts:202`), and JSON schema (`TransactionEventRequest.json:10`). None currently include "Discharging" in ChargingStateEnumType. |
| VALID-03 | Measurand DTO enum includes OCPP 2.1 V2X measurands (Energy.Active.Export.*, Display.*, Setpoint.*) | DTO `MeasurandEnumSchema` (`enums.ts:267`) has 26 values vs. 2.1 spec's 47 values. Missing: all Display.* (9 values), Current.Export.Offered/Minimum, Current.Import.Offered/Minimum, Energy.Active.Import.CableLoss, Energy.Active.Import.LocalGeneration.Register, Energy.Active.Setpoint.Interval, EnergyRequest.* (6 values), Power.Active.Setpoint/Residual, Power.Export.*/Import.*, Voltage.Minimum/Maximum. |
| ENRGY-01 | MeterValueUtils handles Energy.Active.Export.Register and Energy.Active.Export.Interval measurands | Currently `getRegisterValuesMap()` and `getIntervalValuesMap()` are hardcoded to Import measurands. Need parallel Export methods. Existing test file at `00_Base/test/util/MeterValueUtils.test.ts`. |
| ENRGY-02 | totalKwh calculation accounts for bidirectional energy (net = import - export) | `getTotalKwh()` returns import energy only. Recommendation: modify `getTotalKwh()` to compute net energy (import - export) using register or interval values. The `Energy.Active.Net` path already exists as fallback. Downstream consumer `TransactionService.recalculateTotalKwh()` passes result directly to `transaction.totalKwh`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 4.1.12 | DTO enum schema definitions (ChargingStateEnumSchema, MeasurandEnumSchema) | Already used in 00_Base for all DTO validation |
| Ajv | 8.17.1 | JSON schema validation (OCPPValidator, the fixed component) | Already used for OCPP message validation |
| Vitest | 3.2.4 | Test runner for unit tests | Already used in project, config at `vitest.config.ts` |

### Supporting
No new libraries needed. All changes use existing dependencies.

## Architecture Patterns

### File Locations (all changes in 00_Base)
```
00_Base/
  src/
    interfaces/
      modules/
        OCPPValidator.ts           # VALID-01: Fix import + line 144
      dto/types/
        enums.ts                   # VALID-02, VALID-03: Add enum values
    ocpp/model/2.1/
      enums/index.ts               # VALID-02: Add Discharging to ChargingStateEnumType
      schemas/
        TransactionEventRequest.json  # VALID-02: Add Discharging to JSON schema enum
    util/
      MeterValueUtils.ts           # ENRGY-01, ENRGY-02: Add export energy handling
  test/
    modules/
      OCPPValidator.test.ts        # Extend with 2.1 request validation test
    util/
      MeterValueUtils.test.ts      # Extend with export/bidirectional tests
```

### Pattern 1: Zod Enum Schema Definition
**What:** DTO enums follow a consistent three-part pattern: Schema, Enum export, Type export.
**When to use:** When adding new enum values.
**Example:**
```typescript
// Pattern from enums.ts -- add values to the z.enum() array
export const ChargingStateEnumSchema = z.enum([
  'Charging',
  'EVConnected',
  'SuspendedEV',
  'SuspendedEVSE',
  'Idle',
  'Discharging', // <-- Add here
]);

// These derive automatically -- no changes needed:
export const ChargingStateEnum = ChargingStateEnumSchema.enum;
export type ChargingStateEnumType = z.infer<typeof ChargingStateEnumSchema>;
```

### Pattern 2: MeterValueUtils Static Method Pattern
**What:** Static methods on MeterValueUtils that extract measurand values from MeterValueDto arrays.
**When to use:** When adding new measurand extraction (Export values).
**Example:**
```typescript
// Existing pattern in MeterValueUtils.ts -- follow for Export methods
private static getRegisterValuesMap(meterValues: MeterValueDto[]): Map<number, number> {
  const valuesMap = new Map<number, number>();
  for (const mv of meterValues) {
    const ts = Date.parse(mv.timestamp);
    let val = this.findMeasurandValue(
      mv.sampledValue,
      MeasurandEnum['Energy.Active.Import.Register'], // Change to Export for new method
      false,
    );
    if (val === null) {
      val = this.sumPhasedValues(mv.sampledValue, MeasurandEnum['Energy.Active.Import.Register']);
    }
    if (val !== null) {
      valuesMap.set(ts, val);
    }
  }
  return valuesMap;
}
```

### Pattern 3: OCPPValidator Schema Record Switch
**What:** The `validateOCPPRequest` method uses a switch on OCPPVersion to select the correct schema record.
**When to use:** Understanding the validator fix context.
**Example:**
```typescript
// Line 136-148 of OCPPValidator.ts
// Fix: Change line 13 import and line 144 reference
case OCPPVersion.OCPP2_1:
  schema = OCPP2_1_CALL_SCHEMA_RECORD[action]; // Was: OCPP2_1_CALL_RESULT_SCHEMA_RECORD
  break;
```

### Pattern 4: Test Helper Functions
**What:** Tests use `makeMeterValue` helper function for creating test data.
**When to use:** When writing new MeterValueUtils tests for export measurands.
**Example:**
```typescript
// Existing pattern in MeterValueUtils.test.ts
function makeMeterValue(
  ts: string,
  measurand: SampledValue['measurand'],
  value: number,
  unit: string = 'kWh',
  context?: SampledValue['context'],
): MeterValueDto {
  return {
    timestamp: ts,
    sampledValue: [{
      measurand,
      unitOfMeasure: { unit, multiplier: 0 },
      value,
      context,
    }],
  };
}
```

### Anti-Patterns to Avoid
- **Do NOT modify the 2.0.1 enums or schemas:** Changes are 2.1-specific. The 2.0.1 ChargingStateEnumType correctly omits "Discharging."
- **Do NOT add a `totalExportKwh` column to the Transaction model in this phase:** That is a data model change (Phase 2/v2 scope). This phase only modifies `00_Base`.
- **Do NOT create separate `getImportTotalKwh()` and `getExportTotalKwh()` methods with different return signatures:** Keep the API simple -- `getTotalKwh()` should return net energy. The downstream `TransactionService.recalculateTotalKwh()` stores the result directly in `transaction.totalKwh`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema validation | Custom JSON parser | Ajv (already used) | OCPPValidator already wraps Ajv with OCPP-specific keywords |
| Enum validation | Manual string checks | Zod z.enum() (already used) | DTO layer already uses Zod schemas; adding values to existing enum is trivial |
| Test assertions | Custom matchers | Vitest expect() (already used) | Project test infrastructure is in place |

## Common Pitfalls

### Pitfall 1: JSON Schema ChargingStateEnumType Must Also Be Updated
**What goes wrong:** Fixing only the DTO enum and TypeScript protocol enum but NOT the JSON schema `TransactionEventRequest.json`. The JSON schema is what Ajv actually validates against. If "Discharging" is in the DTO enum but not in the JSON schema, incoming 2.1 TransactionEvent requests with `chargingState: "Discharging"` will pass DTO validation but fail Ajv schema validation (after VALID-01 fix).
**Why it happens:** The JSON schemas in `00_Base/src/ocpp/model/2.1/schemas/` are auto-generated from the OCPP specification and appear immutable. Developers may be reluctant to modify them.
**How to avoid:** Update the `ChargingStateEnumType` definition in `TransactionEventRequest.json` line 10 to include "Discharging". Also update `tsEnumNames` on line 11.
**Warning signs:** Tests that validate a TransactionEvent with "Discharging" pass the DTO check but fail the OCPPValidator check.

### Pitfall 2: CONTEXT.md Misidentified "Discharging" Location
**What goes wrong:** The CONTEXT.md states "ChargingStateEnumType at line 202 includes 'Discharging' at line 294." Line 294 of `00_Base/src/ocpp/model/2.1/enums/index.ts` is actually in `MessageStateEnumType`, not `ChargingStateEnumType`. The ChargingStateEnumType at lines 202-208 does NOT include "Discharging".
**Why it happens:** Both enums are in the same file and "Discharging" does appear at line 294, but in the wrong enum.
**How to avoid:** Add "Discharging" to ChargingStateEnumType (lines 202-208) in the protocol enums file, in addition to the DTO enum and JSON schema. All three locations must be updated.
**Warning signs:** Type errors when TypeScript code tries to assign `'Discharging'` to a variable typed as `ChargingStateEnumType`.

### Pitfall 3: MeasurandEnumSchema Update Must Match SampledValue Usage
**What goes wrong:** Adding 2.1 measurands to the DTO `MeasurandEnumSchema` but using the wrong string values. The measurand strings must exactly match the JSON schema values (e.g., `'Display.PresentSOC'` not `'Display_PresentSOC'`).
**Why it happens:** The TypeScript protocol enum uses underscore-separated names (e.g., `Display_PresentSOC = 'Display.PresentSOC'`), but the Zod enum uses the dot-separated string values.
**How to avoid:** Copy values directly from the OCPP 2.1 JSON schema `MeasurandEnumType` enum array in `TransactionEventRequest.json` (lines 52-108). The DTO enum uses the dot-separated form.
**Warning signs:** Meter values with new measurands fail Zod validation despite being correctly formatted per the OCPP 2.1 spec.

### Pitfall 4: getTotalKwh Net Energy Can Be Negative
**What goes wrong:** After adding export energy tracking, `getTotalKwh()` can return negative values (when export > import in a pure discharge session). Downstream code may not expect negative `totalKwh`.
**Why it happens:** The Transaction model uses `DataType.DECIMAL` for `totalKwh`, which supports negatives. But UI or billing code may assume non-negative values.
**How to avoid:** This is acceptable behavior for Phase 1. The `totalKwh` field on the Transaction model already uses `DataType.DECIMAL` which accepts negative values. The Phase 1 scope is to make the calculation correct; downstream impacts are Phase 2 concerns.
**Warning signs:** Negative energy values in test output -- this is correct behavior, not a bug.

### Pitfall 5: Vitest Cannot Run Without `npm install`
**What goes wrong:** Dependencies are not installed (`node_modules/` directory does not exist). `npx vitest run` will fail.
**Why it happens:** The workspace has not had `npm install` run.
**How to avoid:** Run `npm install` before executing tests. Also note: the project requires Node.js >= 24.4.1 but the current environment has Node.js 22.22.1. This may cause compatibility issues.
**Warning signs:** `ERR_MODULE_NOT_FOUND: Cannot find package 'vitest'` error.

### Pitfall 6: MessageStateEnumSchema Already Has "Discharging" in Protocol Layer
**What goes wrong:** The DTO `MessageStateEnumSchema` at `enums.ts:265` does NOT include "Suspended" or "Discharging" but the OCPP 2.1 protocol `MessageStateEnumType` includes both. If display message handling is needed for V2X, this enum also needs updating.
**How to avoid:** Per CONTEXT.md discretion: "If Discharging is needed in MessageStateEnumSchema too, include it. Otherwise skip." The protocol layer already has both values. Add "Suspended" and "Discharging" to the DTO MessageStateEnumSchema for completeness, since the JSON schemas for display messages already reference these values.

## Code Examples

Verified patterns from the codebase:

### VALID-01: OCPPValidator Fix
```typescript
// File: 00_Base/src/interfaces/modules/OCPPValidator.ts
// Line 8-16: Add OCPP2_1_CALL_SCHEMA_RECORD to import
import {
  OCPP1_6_CALL_RESULT_SCHEMA_RECORD,
  OCPP1_6_CALL_SCHEMA_RECORD,
  OCPP2_0_1_CALL_RESULT_SCHEMA_RECORD,
  OCPP2_0_1_CALL_SCHEMA_RECORD,
  OCPP2_1_CALL_RESULT_SCHEMA_RECORD,
  OCPP2_1_CALL_SCHEMA_RECORD,        // <-- ADD THIS
  type OcppRequest,
  type OcppResponse,
} from '../../index.js';

// Line 143-144: Fix schema reference
case OCPPVersion.OCPP2_1:
  schema = OCPP2_1_CALL_SCHEMA_RECORD[action]; // Was: OCPP2_1_CALL_RESULT_SCHEMA_RECORD
  break;
```

### VALID-02: ChargingState Enum Fix (three locations)
```typescript
// Location 1: DTO enum (00_Base/src/interfaces/dto/types/enums.ts:51)
export const ChargingStateEnumSchema = z.enum([
  'Charging',
  'EVConnected',
  'SuspendedEV',
  'SuspendedEVSE',
  'Idle',
  'Discharging',  // ADD
]);

// Location 2: Protocol TypeScript enum (00_Base/src/ocpp/model/2.1/enums/index.ts:202)
export enum ChargingStateEnumType {
  EVConnected = 'EVConnected',
  Charging = 'Charging',
  SuspendedEV = 'SuspendedEV',
  SuspendedEVSE = 'SuspendedEVSE',
  Idle = 'Idle',
  Discharging = 'Discharging',  // ADD
}
```
```json
// Location 3: JSON schema (00_Base/src/ocpp/model/2.1/schemas/TransactionEventRequest.json:10)
"ChargingStateEnumType": {
  "enum": ["EVConnected", "Charging", "SuspendedEV", "SuspendedEVSE", "Idle", "Discharging"],
  "tsEnumNames": ["EVConnected", "Charging", "SuspendedEV", "SuspendedEVSE", "Idle", "Discharging"]
}
```

### VALID-03: Measurand Enum Additions (key V2X values)
```typescript
// File: 00_Base/src/interfaces/dto/types/enums.ts:267
// Add these V2X-critical measurands to MeasurandEnumSchema:
export const MeasurandEnumSchema = z.enum([
  // ... existing 26 values ...
  // NEW 2.1 measurands needed for V2X:
  'Current.Export.Offered',
  'Current.Export.Minimum',
  'Current.Import.Offered',
  'Current.Import.Minimum',
  'Display.PresentSOC',
  'Display.MinimumSOC',
  'Display.TargetSOC',
  'Display.MaximumSOC',
  'Display.RemainingTimeToMinimumSOC',
  'Display.RemainingTimeToTargetSOC',
  'Display.RemainingTimeToMaximumSOC',
  'Display.ChargingComplete',
  'Display.BatteryEnergyCapacity',
  'Display.InletHot',
  'Energy.Active.Import.CableLoss',
  'Energy.Active.Import.LocalGeneration.Register',
  'Energy.Active.Setpoint.Interval',
  'EnergyRequest.Target',
  'EnergyRequest.Minimum',
  'EnergyRequest.Maximum',
  'EnergyRequest.Minimum.V2X',
  'EnergyRequest.Maximum.V2X',
  'EnergyRequest.Bulk',
  'Power.Active.Setpoint',
  'Power.Active.Residual',
  'Power.Export.Minimum',
  'Power.Export.Offered',
  'Power.Import.Offered',
  'Power.Import.Minimum',
  'Voltage.Minimum',
  'Voltage.Maximum',
]);
```

### ENRGY-01/ENRGY-02: Bidirectional Energy in MeterValueUtils
```typescript
// File: 00_Base/src/util/MeterValueUtils.ts
// Add export register extraction method (follows existing pattern)
private static getExportRegisterValuesMap(meterValues: MeterValueDto[]): Map<number, number> {
  const valuesMap = new Map<number, number>();
  for (const mv of meterValues) {
    const ts = Date.parse(mv.timestamp);
    let val = this.findMeasurandValue(
      mv.sampledValue,
      MeasurandEnum['Energy.Active.Export.Register'],
      false,
    );
    if (val === null) {
      val = this.sumPhasedValues(mv.sampledValue, MeasurandEnum['Energy.Active.Export.Register']);
    }
    if (val !== null) {
      valuesMap.set(ts, val);
    }
  }
  return valuesMap;
}

// Modify getTotalKwh to compute net energy (import - export)
public static getTotalKwh(
  meterValues: MeterValueDto[],
  currentTotal: number,
  meterStart?: number,
): number {
  const filteredValues = this.filterValidMeterValues(meterValues);
  if (filteredValues.length === 0) {
    return 0;
  }

  // Try register-based (import - export)
  const importRegisterMap = this.getRegisterValuesMap(filteredValues);
  const exportRegisterMap = this.getExportRegisterValuesMap(filteredValues);
  if (importRegisterMap.size > 0 || exportRegisterMap.size > 0) {
    let importKwh = 0;
    if (importRegisterMap.size > 0) {
      const sorted = this.getSortedKwhByTimestampAscending(importRegisterMap);
      importKwh = meterStart === undefined
        ? sorted[sorted.length - 1] - sorted[0]
        : sorted[sorted.length - 1] - meterStart;
    }
    let exportKwh = 0;
    if (exportRegisterMap.size > 0) {
      const sorted = this.getSortedKwhByTimestampAscending(exportRegisterMap);
      exportKwh = sorted[sorted.length - 1] - sorted[0];
    }
    return importKwh - exportKwh;
  }

  // Try interval-based (import - export)
  const importIntervalMap = this.getIntervalValuesMap(filteredValues);
  const exportIntervalMap = this.getExportIntervalValuesMap(filteredValues);
  if (importIntervalMap.size > 0 || exportIntervalMap.size > 0) {
    const importSorted = this.getSortedKwhByTimestampAscending(importIntervalMap);
    const exportSorted = this.getSortedKwhByTimestampAscending(exportIntervalMap);
    const importSum = importSorted.reduce((sum, v) => sum + v, 0);
    const exportSum = exportSorted.reduce((sum, v) => sum + v, 0);
    return currentTotal + importSum - exportSum;
  }

  // Fall back to net values
  const netMap = this.getNetValuesMap(filteredValues);
  if (netMap.size > 0) {
    const latestTimestamp = Math.max(...Array.from(netMap.keys()));
    return netMap.get(latestTimestamp)!;
  }

  return 0;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OCPP 2.0.1 ChargingState (5 values) | OCPP 2.1 adds "Discharging" | OCPP 2.1 spec | Must update DTO, protocol enum, and JSON schema |
| OCPP 2.0.1 Measurands (26 values) | OCPP 2.1 adds 21 new measurands | OCPP 2.1 spec | Display.*, EnergyRequest.*, Power setpoints, Voltage min/max |
| Import-only energy tracking | Bidirectional energy (import + export) | V2X/BPT requirement | MeterValueUtils must compute net energy |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 24.4.1 | Project requirement (.nvmrc) | Partial (v22.22.1) | 22.22.1 | May work for code changes; test execution may fail |
| npm | Package management | Yes | 10.9.4 | -- |
| node_modules | Running tests | Not installed | -- | Must run `npm install` before testing |
| Vitest | Test runner | Not installed (needs npm install) | 3.2.4 (in package.json) | Must install dependencies first |

**Missing dependencies with no fallback:**
- `node_modules/` not present -- `npm install` required before any test execution

**Missing dependencies with fallback:**
- Node.js 22.22.1 vs required 24.4.1 -- code edits don't require the exact version; TypeScript compilation and test execution may still work on v22

## Open Questions

1. **Is "Discharging" officially part of OCPP 2.1 ChargingStateEnumType?**
   - What we know: The TransactionEventRequest.json schema (generated from OCA spec) does NOT include "Discharging" in ChargingStateEnumType. It IS in MessageStateEnumType. The TypeScript protocol enum also does not include it.
   - What's unclear: Whether the OCA OCPP 2.1 Edition 1 spec intended "Discharging" to be in ChargingStateEnumType, or if V2X discharge state is represented differently (e.g., via operationMode field or as a regular "Charging" state with export meter values).
   - Recommendation: Add it per the explicit requirement VALID-02. The user has specifically requested this. If the spec doesn't include it, CitrineOS is extending the enum to support V2X use cases, which is a reasonable approach since the JSON schema is under project control.

2. **Should getTotalKwh return net energy or should we add a separate method?**
   - What we know: `TransactionService.recalculateTotalKwh()` calls `getTotalKwh()` and stores the result directly in `transaction.totalKwh`. There is no `totalExportKwh` column on the Transaction model (adding it is v2 scope per STATE.md).
   - What's unclear: Whether downstream billing code (CostCalculator) can handle negative `totalKwh`.
   - Recommendation: Make `getTotalKwh()` return net energy (import - export). This is the most accurate representation given the single `totalKwh` field. Downstream impacts (billing, UI) are out of scope for Phase 1.

## Sources

### Primary (HIGH confidence)
- `00_Base/src/interfaces/modules/OCPPValidator.ts` -- confirmed bug at line 144 and missing import
- `00_Base/src/interfaces/dto/types/enums.ts` -- confirmed ChargingStateEnumSchema missing "Discharging" (line 51), MeasurandEnumSchema has 26 values vs 47 in 2.1 spec (line 267)
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- confirmed ChargingStateEnumType at line 202 does NOT include "Discharging" (line 294 is MessageStateEnumType)
- `00_Base/src/ocpp/model/2.1/schemas/TransactionEventRequest.json` -- confirmed ChargingStateEnumType enum at line 10 does not include "Discharging", MeasurandEnumType at lines 52-108 has full 2.1 measurand list
- `00_Base/src/util/MeterValueUtils.ts` -- confirmed only Import measurands used (getRegisterValuesMap, getIntervalValuesMap)
- `00_Base/src/index.ts` -- confirmed `OCPP2_1_CALL_SCHEMA_RECORD` exists and is exported (line 239)
- `00_Base/test/util/MeterValueUtils.test.ts` -- existing test infrastructure with `makeMeterValue` helper
- `00_Base/test/modules/OCPPValidator.test.ts` -- existing test infrastructure for validator
- `03_Modules/Transactions/src/module/TransactionService.ts` -- confirmed `recalculateTotalKwh` calls `getTotalKwh` (line 71)
- `.planning/research/PITFALLS.md` -- confirmed pitfalls P1, P3, P4, P12 are relevant to this phase

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` -- cross-referenced pitfalls with actual code; some references (like line 294 being ChargingState) were inaccurate (it is MessageState)

## Project Constraints (from CLAUDE.md)

- **Branch**: Must work on `feature/ocpp-2.1` branch
- **Protocol**: OCPP 2.1 specifically
- **Environment**: Docker-based deployment
- **Scope**: Single flow (V2X discharge)
- **TypeScript**: ES2022 target, NodeNext module resolution, `verbatimModuleSyntax: true`
- **Imports**: Must use `import type` for type-only imports, `.js` extension for relative imports
- **Code style**: Prettier (single quotes, trailing commas, 100 char width), ESLint
- **File headers**: Apache-2.0 SPDX license header required
- **Naming**: PascalCase for classes/types, camelCase for methods/variables, UPPER_SNAKE_CASE for constants
- **Enum naming**: PascalCase with `EnumType` suffix for OCPP enums, `Enum` suffix without `Type` for internal enums
- **Testing**: Vitest, root command `npm run test` (vitest run)
- **No floating promises**: `@typescript-eslint/no-floating-promises: error`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - All file locations and patterns confirmed by reading source code
- Pitfalls: HIGH - Critical finding about ChargingStateEnumType NOT having "Discharging" in three locations; all verified by direct code inspection
- Code examples: HIGH - All patterns derived from existing codebase code

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (30 days -- stable codebase, no expected upstream changes)
