---
plan_id: 260427-mkw-01
status: complete
commits:
  - adc86956
files_modified:
  - 01_Data/src/layers/sequelize/repository/DeviceModel.ts
---

## Summary

Fixed `findEvseByIdAndConnectorId` in `SequelizeDeviceModelRepository` so OCPP 2.x `setChargingProfile` and `getCompositeSchedule` requests resolve EVSEs correctly.

### What changed

`01_Data/src/layers/sequelize/repository/DeviceModel.ts:496-516` — the where-clause for the Evse lookup was rewritten:

- **Before:** `where: { id, connectorId }` — `id` matched the Evse table primary key (DB-internal), and `connectorId` referenced a column that was dropped by migration `20250821103100-schema-fix.ts:330`.
- **After:** `where: { evseTypeId: id }` — `evseTypeId` is the OCPP-level integer documented in `Evse.ts:36` ("the serial int used in OCPP 2.0.1 to refer to the EVSE"). The `connectorId` filter is removed entirely.

The function signature is unchanged (`tenantId`, `id`, `connectorId`). The `connectorId` parameter is now unused; an `eslint-disable-next-line @typescript-eslint/no-unused-vars` directive was added on its declaration, and a 4-line comment block above the query body explains the semantics for future readers.

Both call-sites in `03_Modules/SmartCharging/src/module/2/MessageApi.ts` (lines 296 and 558) pass `connectorId=null`, so leaving the parameter avoided touching them — matching the plan's "out of scope" rules around renaming and signature changes.

### Verification

| Check | Status |
|---|---|
| Diff is contained to `DeviceModel.ts` | Pass — `git diff --stat` shows only this file (the pre-existing `Server/docker-compose.yml` modification was untouched and unstaged) |
| Where-clause is `{ evseTypeId: id }` with no `connectorId` reference | Pass — verified by reading lines 506-510 |
| Function signature unchanged so SmartCharging callers need no edits | Pass — three params, same names, same types, same return type |
| Prettier conformance (single quotes, semicolons, 2-space indent, trailing commas, max 100 cols) | Pass — diff inspected by eye, longest added line is 96 cols |
| Atomic commit on current branch with plan id in message | Pass — commit `adc86956`, subject `fix(260427-mkw-01): findEvseByIdAndConnectorId looks up by evseTypeId` |

### Deviations

- **`tsc -b` compile check skipped.** The plan's "Notes for executor" explicitly authorises this fallback when `node_modules` is absent. Verified `node_modules` does not exist at the repo root, so neither `tsc` nor `npx -p typescript@5.8.2 tsc` would resolve. The change is mechanical (literal property rename inside a Sequelize `where` clause) and the surrounding code already uses `evseTypeId` on the `Evse` model — no new imports, no new types, no signature changes — so eyeball review against `Evse.ts:36` is sufficient.
- **Branch.** Project `CLAUDE.md` constrains work to `feature/ocpp-2.1`; the working branch is `gsd`. The plan did not include a branch-switch task and the orchestrator selected `gsd` for this quick task. Flagged here for awareness; no action taken.
- **Pre-commit hook bypass.** `--no-verify` was used as authorised by the plan (lint-staged → prettier ENOENTs without `node_modules`).

### Risk / blast radius

Behavioural change is limited to `findEvseByIdAndConnectorId`. Both callers (`SmartChargingOcpp2Api.setChargingProfile` and `SmartChargingOcpp2Api.getCompositeSchedule`) currently pass `connectorId=null`, so the dropped filter changes no caller's expectation — under the previous code, every call already produced 0 rows and was reported as "Evse not found". After the fix, the lookup uses the column that actually carries the OCPP-level integer.

### Self-Check: PASSED

- Modified file exists and contains the new where-clause: confirmed via `Read` of lines 494-512.
- Commit `adc86956` exists: confirmed via `git log -1 --oneline`.
- No other files were committed in this change: confirmed via `git status --short` showing `Server/docker-compose.yml` and `.planning/...` still untracked/unstaged.
