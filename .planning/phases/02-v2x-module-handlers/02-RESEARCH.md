# Phase 2: V2X Module Handlers - Research

**Researched:** 2026-03-26
**Domain:** OCPP 2.1 V2X SmartCharging profile calculation, ChargingProfile persistence, EVDriver module routing
**Confidence:** HIGH

## Summary

Phase 2 requires modifications to three codebase areas: (1) the SmartCharging module's `NotifyEVChargingNeeds` handler and `InternalSmartCharging` profile calculator, (2) the ChargingProfile mapper that converts between OCPP types and database models, and (3) the EVDriver module routing and handler for `NotifyAllowedEnergyTransfer`. All OCPP 2.1 TypeScript types, enums, and JSON schemas for V2X are already present in `00_Base` -- no new type generation is needed.

The critical insight is that the `ChargingSchedulePeriod` column in the `ChargingSchedule` model uses `DataType.JSONB`, meaning any JSON properties (including `dischargeLimit`, `setpoint`) survive database round-trips automatically. The data loss happens exclusively in the `ChargingProfileMapper.fromChargingScheduleType()` method, which explicitly maps only `startPeriod`, `limit`, `numberPhases`, and `phaseToUse` -- dropping all 2.1 fields. The fix is to pass through the full period object rather than cherry-picking fields, or to add the 2.1 fields to the `ChargingSchedulePeriodInput` interface and mapper.

The `InternalSmartCharging.calculateChargingProfile()` method currently accepts `OCPP2_0_1.NotifyEVChargingNeedsRequest` in its implementation (despite the `ISmartCharging` interface declaring `OCPP2_1.NotifyEVChargingNeedsRequest`). The 2.0.1 `EnergyTransferModeEnumType` only contains `DC`, `AC_single_phase`, `AC_two_phase`, `AC_three_phase` -- no BPT values. The 2.1 enum adds `AC_BPT`, `DC_BPT`, `AC_BPT_DER`, `DC_ACDP_BPT`. The implementation must use 2.1 types to handle BPT modes.

**Primary recommendation:** Fix the mapper to preserve all JSONB fields in schedule periods, add BPT switch cases to the profile calculator using OCPP 2.1 types, and add a simple stub handler + routing config for NotifyAllowedEnergyTransfer in the EVDriver module.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use simple max-power approach for BPT profile calculation -- set `dischargeLimit` to `maxDischargePower` from V2XChargingParametersType. No constraint-based optimization.
- **D-02:** For BPT modes, generate a ChargingProfile with `chargingRateUnit: W` and `dischargeLimit` set to the V2X max discharge power. Keep it minimal -- enough to validate the flow works end-to-end.
- **D-03:** Pass-through only -- read V2XChargingParametersType fields from the NotifyEVChargingNeeds request to use in profile calculation, but do NOT persist them to the database. Data model changes (ChargingNeeds JSONB columns) are deferred to v2.
- **D-04:** The NotifyEVChargingNeeds handler validation must be updated to accept requests that have `v2xChargingParameters` (in addition to existing `acChargingParameters`/`dcChargingParameters`).
- **D-05:** Add routing config entries AND a minimal stub handler in EVDriver that returns `Accepted` status. The station gets a valid response confirming BPT is permitted.
- **D-06:** Config entries must be added to all three deployment configs: `docker.ts`, `local.ts`, and `swarm.docker.ts`.

### Claude's Discretion

- ChargingProfile mapper fix approach -- how to preserve `dischargeLimit` and `setpoint` fields through persistence (may need a 2.1-aware mapper or JSONB storage of schedule periods)
- Whether to add SmartCharging tests (zero coverage currently) -- add if straightforward
- Exact stub handler response format for NotifyAllowedEnergyTransfer

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                                | Research Support                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMART-01 | NotifyEVChargingNeeds handler accepts BPT energy transfer modes (AC_BPT, DC_BPT, AC_BPT_DER, DC_ACDP_BPT)                  | Handler validation at module.ts:197-210 checks only `acChargingParameters`/`dcChargingParameters`. Must add `v2xChargingParameters` to the presence check and allow BPT values in `requestedEnergyTransfer` matching. |
| SMART-02 | NotifyEVChargingNeeds handler processes V2XChargingParametersType fields (maxDischargePower, minDischargePower, etc.)      | `V2XChargingParametersType` is fully defined in 00_Base (fields: minChargePower, maxChargePower, minDischargePower, maxDischargePower, etc.). InternalSmartCharging must read these in BPT switch cases.              |
| SMART-03 | ChargingProfile calculation generates discharge-aware profiles with dischargeLimit and setpoint fields for BPT modes       | InternalSmartCharging switch at line 71-100 throws on unknown modes. Must add AC_BPT, DC_BPT, AC_BPT_DER, DC_ACDP_BPT cases that set `dischargeLimit` on schedule period from V2X params (D-01).                      |
| SMART-04 | ChargingProfile mapper preserves OCPP 2.1 fields (dischargeLimit, setpoint) when persisting/sending profiles               | ChargingProfileMapper.fromChargingScheduleType() at lines 189-194 maps only 4 period fields, dropping all 2.1 fields. JSONB column stores raw JSON, so the fix is in the mapper, not the schema.                      |
| EVDRV-01 | NotifyAllowedEnergyTransfer action is routed to EVDriver module in all config files (docker.ts, local.ts, swarm.docker.ts) | `OCPP_CallAction.NotifyAllowedEnergyTransfer` exists in the CallAction enum. Must add to `evdriver.requests` (CS-to-CSMS direction) in all 3 config files and add a stub handler in EVDriver module.                  |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Branch**: Must work on `feature/ocpp-2.1` branch
- **Protocol**: OCPP 2.1 specifically
- **Environment**: Docker-based deployment
- **Code style**: Prettier (single quotes, trailing commas, print width 100), ESLint flat config
- **TypeScript**: ES2022 target, NodeNext module resolution, `verbatimModuleSyntax: true` (use `import type`)
- **Imports**: All relative imports MUST include `.js` extension
- **Conventions**: `@AsHandler` decorator pattern, `_handle` prefix for handler methods, underscore prefix for private/protected
- **GSD Workflow**: Do not make direct repo edits outside GSD workflow

## Architecture Patterns

### Current SmartCharging Handler Flow (NotifyEVChargingNeeds)

```
Station sends NotifyEVChargingNeeds
  -> SmartChargingModule._handleNotifyEVChargingNeeds()
    -> Validate: has AC or DC params + matches energy transfer mode  [BUG: rejects V2X]
    -> Calculate: _smartChargingService.calculateChargingProfile()   [BUG: throws on BPT]
    -> Persist: chargingProfileRepository.createChargingNeeds()      [OK: spreads request]
    -> Respond: Accepted
    -> Store: chargingProfileRepository.createOrUpdateChargingProfile()
       -> OCPP2_0_1_Mapper.ChargingProfileMapper.fromChargingProfileType() [BUG: drops 2.1 fields]
    -> Send: SetChargingProfile to station
```

### Target SmartCharging Handler Flow (after Phase 2)

```
Station sends NotifyEVChargingNeeds (with v2xChargingParameters, BPT mode)
  -> SmartChargingModule._handleNotifyEVChargingNeeds()
    -> Validate: has AC, DC, OR V2X params + allows BPT energy transfer modes
    -> Calculate: _smartChargingService.calculateChargingProfile()
       -> BPT switch cases read V2X params (maxDischargePower, etc.)
       -> Generate profile with dischargeLimit and setpoint on schedule periods
    -> Persist: chargingProfileRepository.createChargingNeeds() (V2X params NOT persisted per D-03)
    -> Respond: Accepted
    -> Store: chargingProfileRepository.createOrUpdateChargingProfile()
       -> Mapper preserves dischargeLimit/setpoint fields in JSONB
    -> Send: SetChargingProfile to station (with discharge fields intact)
```

### NotifyAllowedEnergyTransfer Flow (new)

```
Station sends NotifyAllowedEnergyTransfer (transactionId, allowedEnergyTransfer[])
  -> EVDriverModule._handleNotifyAllowedEnergyTransfer()
    -> Return: { status: 'Accepted' }
```

### Key Integration Points

1. **SmartCharging module.ts line 197-210**: The `hasAcOrDcChargingParameters` and `matchedChargingType` validation checks
2. **InternalSmartCharging.ts line 71-100**: The `switch(transferMode)` statement with the `default: throw` clause
3. **InternalSmartCharging.ts line 35-40**: Method signature uses `OCPP2_0_1.NotifyEVChargingNeedsRequest` but interface declares `OCPP2_1.NotifyEVChargingNeedsRequest`
4. **ChargingProfileMapper.ts line 189-194**: Period field mapping that drops 2.1 fields
5. **Server config files**: `evdriver.requests` arrays in docker.ts, local.ts, swarm.docker.ts

### Recommended Project Structure Changes

```
03_Modules/SmartCharging/src/module/
  module.ts                           # Modify: validation logic at lines 197-210
  smartCharging/
    InternalSmartCharging.ts          # Modify: add BPT cases, use OCPP2_1 types
    SmartCharging.ts                  # No change (interface already uses OCPP2_1 types)

03_Modules/EVDriver/src/module/
  module.ts                           # Modify: add _handleNotifyAllowedEnergyTransfer stub

01_Data/src/layers/sequelize/mapper/2.0.1/
  ChargingProfileMapper.ts           # Modify: preserve 2.1 fields in period mapping

Server/src/config/envs/
  docker.ts                           # Modify: add NotifyAllowedEnergyTransfer to evdriver
  local.ts                            # Modify: add NotifyAllowedEnergyTransfer to evdriver
  swarm.docker.ts                     # Modify: add NotifyAllowedEnergyTransfer to evdriver
```

### Anti-Patterns to Avoid

- **Creating a separate 2.1 mapper**: The existing mapper already accepts `OCPP2_1.ChargingProfileType` in `fromChargingProfileType()`. Extending the period mapping is simpler than a parallel mapper.
- **Adding V2X columns to ChargingNeeds model**: Decision D-03 explicitly defers this. The handler uses V2X params for calculation but does NOT persist them.
- **Using OCPP2_0_1 types for BPT logic**: The 2.0.1 `EnergyTransferModeEnumType` does NOT contain BPT values. Use `OCPP2_1.EnergyTransferModeEnumType` in the switch statement.

## Don't Hand-Roll

| Problem                  | Don't Build                     | Use Instead                                                                                      | Why                                                                                    |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| V2X TypeScript types     | Custom type definitions         | `OCPP2_1.V2XChargingParametersType`, `OCPP2_1.ChargingSchedulePeriodType` from `@citrineos/base` | Auto-generated from OCA JSON schemas, already includes all V2X fields                  |
| Action routing           | Custom message dispatch         | `OCPP_CallAction.NotifyAllowedEnergyTransfer` enum value + config array                          | Standard CitrineOS pattern; RabbitMQ subscription created automatically                |
| Handler registration     | Manual route setup              | `@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.NotifyAllowedEnergyTransfer)` decorator       | Standard decorator pattern used by every module                                        |
| JSONB period persistence | Column-by-column period storage | `DataType.JSONB` for `chargingSchedulePeriod`                                                    | Already uses JSONB -- preserves arbitrary JSON properties if mapper doesn't strip them |

## Common Pitfalls

### Pitfall 1: Mapper Drops 2.1 Fields From Schedule Periods

**What goes wrong:** The `ChargingProfileMapper.fromChargingScheduleType()` explicitly maps only `startPeriod`, `limit`, `numberPhases`, `phaseToUse` from each period. All 2.1 fields (`dischargeLimit`, `setpoint`, `limit_L2`, etc.) are silently discarded.
**Why it happens:** The mapper was written for OCPP 2.0.1 which only has those 4 fields.
**How to avoid:** Add 2.1 fields to `ChargingSchedulePeriodInput` interface and mapper, OR use a spread operator to pass through all fields and only explicitly map enum conversions.
**Warning signs:** ChargingProfile stored in DB has `chargingSchedulePeriod` JSON without `dischargeLimit`/`setpoint` keys.

### Pitfall 2: InternalSmartCharging Uses Wrong Type Namespace

**What goes wrong:** The `calculateChargingProfile` implementation imports `OCPP2_0_1` and uses `OCPP2_0_1.EnergyTransferModeEnumType` in the switch, `OCPP2_0_1.ChargingRateUnitEnumType`, etc. BPT values don't exist in this enum.
**Why it happens:** The class was written before 2.1 support. The interface (`ISmartCharging`) was updated to use 2.1 types but the implementation was not.
**How to avoid:** Update the import to use `OCPP2_1` types throughout the method. The 2.1 enums are supersets of 2.0.1, so existing AC/DC cases still work.
**Warning signs:** TypeScript compile error when trying to match `AC_BPT` against `OCPP2_0_1.EnergyTransferModeEnumType`.

### Pitfall 3: NotifyAllowedEnergyTransfer Is CS-to-CSMS, Not CSMS-to-CS

**What goes wrong:** Adding the action to `evdriver.responses` (CSMS-to-CS direction) instead of `evdriver.requests` (CS-to-CSMS direction). The CONTEXT.md says "responses" but the OCPP 2.1 spec defines NotifyAllowedEnergyTransfer as a CSMS-initiated message that the CS responds to.
**Why it happens:** Confusion about message direction in OCPP terminology.
**How to avoid:** Check the type files -- `NotifyAllowedEnergyTransferRequest` extends `OcppRequest` (CSMS sends request, CS sends response). In CitrineOS, the CSMS _sends_ this message, so the module needs the response handler (`evdriver.responses`). The station's response comes back as `NotifyAllowedEnergyTransferResponse`. So it IS `evdriver.responses` -- the CSMS sends the request via MessageApi, and the response handler in the module processes the station's reply.
**Warning signs:** Handler never fires because action is in wrong config list.

**Update after deeper analysis:** Looking at the CitrineOS routing pattern more carefully:

- `requests` = actions where the Charging Station SENDS a request TO the CSMS (CS -> CSMS)
- `responses` = actions where the CSMS SENDS a request TO the Charging Station and handles the response (CSMS -> CS)

`NotifyAllowedEnergyTransfer` is CSMS -> CS (CSMS tells the station which energy transfer modes are allowed). The CSMS sends the request, the station sends back a response. The module's response handler processes the station's response. Therefore it goes in `evdriver.responses`. This is correct per D-05.

### Pitfall 4: Validation Logic Checks requestedEnergyTransfer Against Parameter Type

**What goes wrong:** The existing validation at module.ts:201-208 checks that if `requestedEnergyTransfer` is DC then `dcChargingParameters` is present, and if non-DC then `acChargingParameters` is present. BPT modes don't follow this pattern -- they use `v2xChargingParameters`.
**Why it happens:** The validation predates V2X support.
**How to avoid:** Add a separate check path: if `v2xChargingParameters` is present AND `requestedEnergyTransfer` is a BPT mode, consider it valid. The simplest approach: check `hasAcOrDcOrV2xChargingParameters` (any of the three).
**Warning signs:** Requests with `v2xChargingParameters` and `AC_BPT`/`DC_BPT` mode still get rejected.

### Pitfall 5: Profile Return Type Mismatch

**What goes wrong:** `InternalSmartCharging.calculateChargingProfile()` returns `OCPP2_0_1.ChargingProfileType` in the implementation, which doesn't have `dischargeLimit`/`setpoint` on schedule periods.
**Why it happens:** The return type annotation uses the 2.0.1 type, even though the interface uses 2.1.
**How to avoid:** Change the return type to `OCPP2_1.ChargingProfileType`. The 2.1 type is a superset of 2.0.1 so all existing fields are compatible.
**Warning signs:** TypeScript error when trying to assign `dischargeLimit` on the schedule period.

## Code Examples

### Example 1: Updated Validation Logic (module.ts)

```typescript
// Source: SmartCharging/src/module/module.ts lines 197-210
// Current code:
const hasAcOrDcChargingParameters =
  givenNeeds.dcChargingParameters !== null || givenNeeds.acChargingParameters !== null;

// Fixed code -- add v2xChargingParameters:
const hasChargingParameters =
  givenNeeds.acChargingParameters != null ||
  givenNeeds.dcChargingParameters != null ||
  givenNeeds.v2xChargingParameters != null;

// Current matchedChargingType logic must also be extended for BPT modes:
const isBptMode = [
  OCPP2_1.EnergyTransferModeEnumType.AC_BPT,
  OCPP2_1.EnergyTransferModeEnumType.DC_BPT,
  OCPP2_1.EnergyTransferModeEnumType.AC_BPT_DER,
  OCPP2_1.EnergyTransferModeEnumType.DC_ACDP_BPT,
].includes(givenNeeds.requestedEnergyTransfer);

const matchedChargingType =
  ((givenNeeds.dcChargingParameters ?? false) &&
    givenNeeds.requestedEnergyTransfer === OCPP2_1.EnergyTransferModeEnumType.DC) ||
  ((givenNeeds.acChargingParameters ?? false) &&
    givenNeeds.requestedEnergyTransfer !== OCPP2_1.EnergyTransferModeEnumType.DC &&
    !isBptMode) ||
  (isBptMode && givenNeeds.v2xChargingParameters != null);
```

### Example 2: BPT Switch Cases in InternalSmartCharging

```typescript
// Source: InternalSmartCharging.ts, inside calculateChargingProfile switch statement
// After updating imports to use OCPP2_1:

case OCPP2_1.EnergyTransferModeEnumType.AC_BPT:
case OCPP2_1.EnergyTransferModeEnumType.AC_BPT_DER: {
  const v2xParams = chargingNeeds.v2xChargingParameters;
  if (v2xParams) {
    chargingRateUnit = OCPP2_1.ChargingRateUnitEnumType.W;
    limit = v2xParams.maxChargePower ?? 0;
    // dischargeLimit is negative per OCPP 2.1 spec
    dischargeLimit = v2xParams.maxDischargePower
      ? -(v2xParams.maxDischargePower)
      : undefined;
  }
  break;
}

case OCPP2_1.EnergyTransferModeEnumType.DC_BPT:
case OCPP2_1.EnergyTransferModeEnumType.DC_ACDP_BPT: {
  const v2xParams = chargingNeeds.v2xChargingParameters;
  if (v2xParams) {
    numberPhases = undefined; // DC -- no phases
    chargingRateUnit = OCPP2_1.ChargingRateUnitEnumType.W;
    limit = v2xParams.maxChargePower ?? 0;
    dischargeLimit = v2xParams.maxDischargePower
      ? -(v2xParams.maxDischargePower)
      : undefined;
  }
  break;
}
```

### Example 3: Schedule Period with Discharge Fields

```typescript
// Building a ChargingSchedulePeriod with discharge fields:
const chargingSchedulePeriod: [
  OCPP2_1.ChargingSchedulePeriodType,
  ...OCPP2_1.ChargingSchedulePeriodType[],
] = [
  {
    startPeriod: 0,
    limit,
    numberPhases,
    dischargeLimit, // negative value, e.g. -11000 (W)
    setpoint: undefined, // not used for simple limit-based approach
  },
];
```

### Example 4: Mapper Fix for ChargingSchedulePeriodInput

```typescript
// Source: 01_Data/src/layers/sequelize/mapper/2.0.1/ChargingProfileMapper.ts
// Current code (line 189-194):
chargingSchedulePeriod: schedule.chargingSchedulePeriod.map((period) => ({
  startPeriod: period.startPeriod,
  limit: period.limit,
  numberPhases: period.numberPhases,
  phaseToUse: period.phaseToUse,
}));

// Fixed: spread all fields to preserve 2.1 properties in JSONB
chargingSchedulePeriod: schedule.chargingSchedulePeriod.map((period) => ({
  ...period, // Preserves dischargeLimit, setpoint, limit_L2, etc.
  startPeriod: period.startPeriod,
  limit: period.limit,
  numberPhases: period.numberPhases,
  phaseToUse: period.phaseToUse,
}));
```

Note: The `...period` spread plus explicit fields is intentional -- explicit fields ensure type safety for known properties while the spread preserves any additional OCPP 2.1 fields. Since the column is `DataType.JSONB`, any extra properties are stored and retrieved faithfully.

The `ChargingSchedulePeriodInput` interface should also be updated to include the optional 2.1 fields so TypeScript knows about them:

```typescript
export interface ChargingSchedulePeriodInput {
  startPeriod: number;
  limit?: number | null; // Optional in 2.1 for setpoint modes
  numberPhases?: number | null;
  phaseToUse?: number | null;
  // OCPP 2.1 V2X fields
  dischargeLimit?: number | null;
  dischargeLimit_L2?: number | null;
  dischargeLimit_L3?: number | null;
  setpoint?: number | null;
  setpoint_L2?: number | null;
  setpoint_L3?: number | null;
  // Allow additional 2.1 fields to pass through
  [key: string]: unknown;
}
```

### Example 5: EVDriver Stub Handler

```typescript
// In 03_Modules/EVDriver/src/module/module.ts:
@AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.NotifyAllowedEnergyTransfer)
protected async _handleNotifyAllowedEnergyTransfer(
  message: IMessage<OCPP2_response_types.NotifyAllowedEnergyTransferResponse>,
  props?: HandlerProperties,
): Promise<void> {
  this._logger.debug('NotifyAllowedEnergyTransfer response received:', message, props);
  // Stub: log the response status. The CSMS sent the request via MessageApi;
  // this handler processes the station's response.
}
```

Wait -- re-examining the message direction:

- `NotifyAllowedEnergyTransfer` is a **CSMS-to-CS** message (the CSMS tells the station which energy transfer modes are allowed)
- The CSMS sends `NotifyAllowedEnergyTransferRequest` to the station
- The station responds with `NotifyAllowedEnergyTransferResponse`
- The EVDriver module needs a **response handler** that processes `NotifyAllowedEnergyTransferResponse`
- The actual sending is done via a MessageApi endpoint (or manual API call)

Per D-05, we need a "stub handler that returns Accepted status." But since this is CSMS-initiated, the station returns the status. The CSMS handler just logs the response. A stub handler for the response is the right approach.

However, re-reading D-05 more carefully: "The station gets a valid response confirming BPT is permitted." This implies the station sends the request and the CSMS responds. Let me re-check.

Looking at the OCPP 2.1 spec types:

- `NotifyAllowedEnergyTransferRequest` has `transactionId` and `allowedEnergyTransfer` -- these are the modes the CSMS allows
- This is clearly **CSMS -> CS**: the CSMS notifies the CS about allowed modes

So D-05's wording "The station gets a valid response" means: the station receives the CSMS's request (which acts as notification) and responds with Accepted/Rejected.

For the CSMS side, we need:

1. A **response handler** in EVDriver to process the station's response (log it)
2. A way to **send** the NotifyAllowedEnergyTransfer request (MessageApi endpoint or triggered by another handler)

For a minimal stub: add the response handler and put `NotifyAllowedEnergyTransfer` in `evdriver.responses`. The MessageApi endpoint for actually sending the request is v2 (EVDRV-02).

### Example 6: Config Update

```typescript
// In all three config files (docker.ts, local.ts, swarm.docker.ts):
evdriver: {
  endpointPrefix: '/evdriver',  // or 'evdriver' for swarm
  responses: [
    OCPP_CallAction.CancelReservation,
    OCPP_CallAction.ClearCache,
    // ... existing entries ...
    OCPP_CallAction.NotifyAllowedEnergyTransfer,  // NEW
  ],
  requests: [OCPP_CallAction.Authorize, OCPP_CallAction.ReservationStatusUpdate],
},
```

## Detailed Code Analysis

### File 1: SmartCharging module.ts -- Validation Logic

**Lines 197-210** contain the validation that rejects V2X requests:

```typescript
const hasAcOrDcChargingParameters =
  givenNeeds.dcChargingParameters !== null || givenNeeds.acChargingParameters !== null;
```

This check uses `!== null` but does not check for `undefined`. When a V2X request comes in, `acChargingParameters` and `dcChargingParameters` may be `undefined` (not `null`), and `v2xChargingParameters` is not checked at all. Using `!= null` (loose equality, catches both null and undefined) is the right fix.

The `matchedChargingType` check is also problematic:

```typescript
const matchedChargingType =
  ((givenNeeds.dcChargingParameters ?? false) &&
    givenNeeds.requestedEnergyTransfer === OCPP2_1.EnergyTransferModeEnumType.DC) ||
  ((givenNeeds.acChargingParameters ?? false) &&
    givenNeeds.requestedEnergyTransfer !== OCPP2_1.EnergyTransferModeEnumType.DC);
```

For BPT modes: `requestedEnergyTransfer` is `AC_BPT` or `DC_BPT`, neither `dcChargingParameters` nor `acChargingParameters` is provided (V2X uses `v2xChargingParameters`), so this evaluates to `false || false = false`, causing rejection.

### File 2: InternalSmartCharging.ts -- Profile Calculator

The method signature and body use `OCPP2_0_1` types:

```typescript
async calculateChargingProfile(
  request: OCPP2_0_1.NotifyEVChargingNeedsRequest,  // Should be OCPP2_1
  ...
): Promise<OCPP2_0_1.ChargingProfileType> {         // Should be OCPP2_1
```

The switch statement at line 71 handles `AC_single_phase`, `AC_two_phase`, `AC_three_phase`, `DC`, and throws on `default`. BPT modes fall through to `default`.

Key observation: the `ISmartCharging` interface already declares the correct 2.1 types:

```typescript
calculateChargingProfile(
  request: OCPP2_1.NotifyEVChargingNeedsRequest,
  ...
): Promise<OCPP2_1.ChargingProfileType>;
```

So the fix is to align the implementation with the interface.

### File 3: ChargingProfileMapper.ts -- Period Field Mapping

The mapper's `fromChargingScheduleType` at line 181 accepts `OCPP2_1.ChargingScheduleType` but the period mapping on lines 189-194 only maps 4 fields. The `ChargingSchedulePeriodInput` interface (lines 50-55) only declares those 4 fields.

Since the DB column is `DataType.JSONB`, the simplest fix is to spread the full period object. This preserves `dischargeLimit`, `setpoint`, and any other 2.1 fields without requiring type changes. For type safety, add the known 2.1 fields to `ChargingSchedulePeriodInput`.

### File 4: EVDriver module.ts

The module is 680+ lines. Handler methods use `@AsHandler(OCPP_2_VER_LIST, ...)` or `@AsHandler([OCPPVersion.OCPP2_0_1], ...)` patterns. The new `NotifyAllowedEnergyTransfer` handler should use `@AsHandler([OCPPVersion.OCPP2_1], ...)` since it's a 2.1-only action.

The module currently subscribes to `config.modules.evdriver.requests` for incoming CS requests and `config.modules.evdriver.responses` for CSMS-sent request responses (line 183-184).

### File 5: Config Files

All three configs (`docker.ts`, `local.ts`, `swarm.docker.ts`) have identical `evdriver.responses` arrays. The `NotifyAllowedEnergyTransfer` action must be added to all three.

## State of the Art

| Old Approach (2.0.1)                                   | Current Approach (2.1)                                                        | Impact                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| AC/DC params only in ChargingNeeds                     | AC/DC/V2X/DER params                                                          | Must handle `v2xChargingParameters` in addition to AC/DC |
| ChargingSchedulePeriod has `limit` only                | Period has `limit`, `dischargeLimit`, `setpoint`, per-phase variants          | Mapper must preserve new fields                          |
| EnergyTransferMode: 4 values (AC_1p, AC_2p, AC_3p, DC) | 9 values (adds AC_BPT, DC_BPT, AC_BPT_DER, AC_DER, DC_ACDP, DC_ACDP_BPT, WPT) | Switch statement needs BPT cases                         |
| No NotifyAllowedEnergyTransfer                         | CSMS -> CS message for BPT mode confirmation                                  | New action routing + handler                             |

## Open Questions

1. **dischargeLimit sign convention**

   - What we know: The OCPP 2.1 spec comment says "Note, these are negative values in order to be consistent with _setpoint_, which can be positive and negative." The `maxDischargePower` in `V2XChargingParametersType` says "Value >= 0."
   - What's unclear: Should `dischargeLimit` be set to `-maxDischargePower` (negate the V2X param), or should it be set to `maxDischargePower` as-is (positive)?
   - Recommendation: Follow the spec -- negate `maxDischargePower` to produce a negative `dischargeLimit` value. The spec explicitly says discharge limits are negative.

2. **ChargingSchedulePeriodInput index signature**

   - What we know: Adding `[key: string]: unknown` to the interface allows arbitrary properties to pass through.
   - What's unclear: Whether this conflicts with strict TypeScript checking elsewhere in the codebase.
   - Recommendation: Add specific known 2.1 fields (`dischargeLimit`, `setpoint`, etc.) as optional properties rather than using an index signature. This is type-safe and self-documenting.

3. **SmartCharging test coverage**
   - What we know: Zero test files exist for SmartCharging module. CONTEXT.md says tests are at Claude's discretion.
   - What's unclear: Whether the test infrastructure (vitest, mocking patterns) works smoothly for module-level tests.
   - Recommendation: Add a focused test file for `InternalSmartCharging.calculateChargingProfile()` BPT cases. The method is pure logic (read params, compute profile) with a mockable repository dependency, making it straightforward to test.

## Sources

### Primary (HIGH confidence)

- `03_Modules/SmartCharging/src/module/module.ts` -- handler validation logic, line-by-line analysis
- `03_Modules/SmartCharging/src/module/smartCharging/InternalSmartCharging.ts` -- profile calculator, switch statement, type usage
- `03_Modules/SmartCharging/src/module/smartCharging/SmartCharging.ts` -- ISmartCharging interface, confirms 2.1 types
- `01_Data/src/layers/sequelize/mapper/2.0.1/ChargingProfileMapper.ts` -- mapper field mapping, ChargingSchedulePeriodInput interface
- `01_Data/src/layers/sequelize/model/ChargingProfile/ChargingSchedule.ts` -- confirms JSONB storage for chargingSchedulePeriod
- `01_Data/src/layers/sequelize/model/ChargingProfile/ChargingNeeds.ts` -- confirms missing V2X columns (consistent with D-03)
- `00_Base/src/ocpp/model/2.1/types/NotifyEVChargingNeedsRequest.ts` -- V2XChargingParametersType definition
- `00_Base/src/ocpp/model/2.1/types/SetChargingProfileRequest.ts` -- ChargingSchedulePeriodType with dischargeLimit/setpoint
- `00_Base/src/ocpp/model/2.1/types/NotifyAllowedEnergyTransferRequest.ts` -- Request type definition
- `00_Base/src/ocpp/model/2.1/types/NotifyAllowedEnergyTransferResponse.ts` -- Response type definition
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- EnergyTransferModeEnumType (BPT values), NotifyAllowedEnergyTransferStatusEnumType
- `00_Base/src/ocpp/model/2.0.1/enums/index.ts` -- Confirms 2.0.1 enum lacks BPT values
- `00_Base/src/ocpp/rpc/message.ts` -- OCPP_CallAction enum, OCPP2_1_CallActions set
- `Server/src/config/envs/docker.ts` -- Module routing config structure
- `Server/src/config/envs/local.ts` -- Module routing config structure
- `Server/src/config/envs/swarm.docker.ts` -- Module routing config structure
- `.planning/research/SUMMARY.md` -- Gap analysis and implementation order

## Metadata

**Confidence breakdown:**

- SmartCharging handler fix: HIGH -- exact lines identified, clear fix path
- Profile calculator BPT cases: HIGH -- interface already declares 2.1 types, just need implementation alignment
- Mapper fix: HIGH -- JSONB column confirmed, spread operator approach is minimal risk
- EVDriver routing + stub: HIGH -- standard pattern, only config changes + simple decorator handler
- dischargeLimit sign convention: MEDIUM -- spec comments are clear but implementation should be validated against a real station

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable codebase, no rapid changes expected)
