---
plan_id: 260427-l9m-01
status: complete
commit: bba7cf5e
tasks_completed: 1
tasks_total: 1
files_modified:
  - tools/citrineos-ui/src/api.js
  - tools/citrineos-ui/src/App.jsx
files_created: []
---

# Summary 260427-l9m: Fix BPTSlider evseId to use Evse.evseTypeId

## What changed

Switched the BPTSlider's `evseId` prop source from `Transaction.evseId` (a DB
foreign key to `Evse.id`) to `Evse.evseTypeId` (the OCPP-level integer used in
SetChargingProfile / UpdateDynamicSchedule payloads), reached through the
Hasura `Transactions.Evse` object relationship.

## Why

Quick task `260427-kze` threaded `activeTx.evseId` into BPTSlider. That column
is `@ForeignKey(() => Evse)` pointing at the Evse table's primary key — not
the OCPP-level evse number. When the active station's Evse row had
`id ≠ evseTypeId`, the CSMS rejected SetChargingProfile with
`Evse 1 not found`. The fix sends `evseTypeId`, which is what OCPP 2.1 expects.

## Edits

**`tools/citrineos-ui/src/api.js`** (strict query in `listTransactions`):

```diff
         transactionId
         stationId
-        evseId
+        Evse {
+          evseTypeId
+        }
         isActive
```

The fallback query (lines 70-79 after the change) was intentionally left
selectorless — it remains a defensive degradation path for the case where
Evse permissions or the relation are unavailable.

**`tools/citrineos-ui/src/App.jsx`** (BPTSlider prop):

```diff
-            evseId={activeTx.evseId}
+            evseId={activeTx.Evse?.evseTypeId}
```

`BPTSlider.jsx` was not touched — it still accepts `evseId` and falls back to
`1` when undefined. The fallback now triggers only when a transaction has no
linked Evse row yet (transient pre-TransactionEventRequest state), which
matches the prior task's fallback semantics.

## Verification

- `git diff` shows exactly two changed regions (one in api.js, one in App.jsx)
- No other files modified by this task (Server/docker-compose.yml change in
  the working tree is pre-existing and unrelated)
- BPTSlider.jsx untouched (per plan)
- Diff conforms to `.prettierrc`: 2-space indent preserved inside the GraphQL
  template literal, semicolons preserved, no string-quote changes, longest
  new line ~50 cols (well under 100)

## Commit

`bba7cf5e` — `fix(quick-260427-l9m): use Evse.evseTypeId for BPTSlider via Hasura relation`

Committed with `--no-verify` (authorised by user — repo has no `node_modules`,
so the husky pre-commit hook ENOENTs on prettier; same condition as 260427-kze).

## Deviations

None — plan executed exactly as written.

## Self-Check: PASSED

- File `tools/citrineos-ui/src/api.js` modified — confirmed via `git diff`
- File `tools/citrineos-ui/src/App.jsx` modified — confirmed via `git diff`
- Commit `bba7cf5e` exists — confirmed via `git log --oneline -1`
