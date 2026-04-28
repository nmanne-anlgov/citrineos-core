---
plan_id: 260427-mkw-01
description: Fix findEvseByIdAndConnectorId — look up by evseTypeId (OCPP-level int) and drop the removed connectorId column filter
must_haves:
  truths:
    - "OCPP 2.x request.evseId is the OCPP-level integer = Evse.evseTypeId, NOT the Evse table primary key (Evse.id)"
    - "Evses.connectorId column was removed by migration 20250821103100-schema-fix.ts:330 — any where-clause that references it produces a Postgres column-not-found error"
    - "findEvseByIdAndConnectorId is called by SmartCharging.setChargingProfile (line 296) and SmartCharging.getCompositeSchedule (line 558), both passing connectorId=null"
    - "Reproduced via curl: POST /ocpp/2.1/smartcharging/setChargingProfile with evseId=1 against a station whose only Evse has id=1, evseTypeId=1 returns {success:false, payload:'Evse 1 not found.'}"
  artifacts:
    - "01_Data/src/layers/sequelize/repository/DeviceModel.ts — findEvseByIdAndConnectorId where-clause uses evseTypeId, no connectorId reference"
  key_links:
    - "01_Data/src/layers/sequelize/repository/DeviceModel.ts:496-508 (the broken function)"
    - "01_Data/src/layers/sequelize/model/Location/Evse.ts:36 (evseTypeId comment: 'the serial int used in OCPP 2.0.1 to refer to the EVSE')"
    - "migrations/20250821103100-schema-fix.ts:330 (queryInterface.removeColumn('Evses', 'connectorId'))"
    - "03_Modules/SmartCharging/src/module/2/MessageApi.ts:296,558 (callsites — both pass connectorId=null)"
---

## Plan 260427-mkw-01

### Context

OCPP 2.1 V2X discharge testing reproduces `Evse 1 not found` when calling `setChargingProfile`. Root cause is in `findEvseByIdAndConnectorId`:

```ts
// 01_Data/src/layers/sequelize/repository/DeviceModel.ts:501-506
const storedEvses = await this.evse.readAllByQuery(tenantId, {
  where: {
    id: id,
    connectorId: connectorId,
  },
});
```

Two defects:
1. **Wrong column for OCPP-level evseId.** `id` is the Evse table primary key (DB-internal). OCPP 2.x `evseId` in the request body is the OCPP-level serial integer per Evse.ts:36, which CitrineOS stores as `Evse.evseTypeId`. The two are coincidentally equal in trivial single-EVSE seeds but diverge in any non-trivial setup.
2. **Removed column referenced.** Migration `20250821103100-schema-fix.ts:330` did `queryInterface.removeColumn('Evses', 'connectorId')`. Any query referencing `connectorId` on Evse fails. In Sequelize the failed query returns 0 rows (caught/ignored), surfacing as `Evse not found`.

### Tasks

#### Task 1: Replace where-clause with evseTypeId, remove connectorId filter

- **files:**
  - `01_Data/src/layers/sequelize/repository/DeviceModel.ts`
- **action:**
  Change `findEvseByIdAndConnectorId` (lines 496-508) so the where-clause is:
  ```ts
  where: {
    evseTypeId: id,
  },
  ```
  Drop the `connectorId: connectorId` line entirely. Keep the function signature unchanged (`tenantId`, `id`, `connectorId`) — both callers pass `connectorId=null` so leaving the param avoids touching them. Document with a one-line comment that the param is currently unused (kept for signature stability).
- **verify:**
  - `git diff` shows changes only in `DeviceModel.ts`
  - The Evse where-clause is `{ evseTypeId: id }` with no `connectorId` reference
  - Function signature is unchanged so callers in SmartCharging MessageApi need no edits
  - `tsc -b` succeeds (compile only — do not run tests)
- **done:** Atomic commit on the current branch with the plan id in the message.

### Out of scope

- Renaming the function to `findEvseByEvseTypeId` (or similar) — would force callsite updates in SmartCharging and is a code-quality nicety, not the bug.
- Removing the `connectorId` parameter — same rationale.
- Fixing the systemic `packageGroupCall(this._module.sendCall, ...)` unbound-this bug found at the same time — that's a separate phase being added via `/gsd-add-phase`, not this quick task.

### Notes for executor

- Pre-commit hook (lint-staged → prettier) ENOENTs because the repo has no `node_modules`. User has authorised `--no-verify` for this branch's commits. Inspect the diff against `.prettierrc` (single quotes, semicolons, 2-space indent, trailing commas, max 100 cols) before committing.
- Run `npx -p typescript@5.8.2 tsc -b` if available; otherwise just `tsc -b` from the repo root. If neither is reachable (no node_modules), skip the compile check and note it in the SUMMARY's deviation block — the change is mechanical and small enough to inspect by eye.
- Do not run the full test suite, do not start docker, do not run any module's runtime.
- Do not commit `.planning/` artifacts — orchestrator handles that.
