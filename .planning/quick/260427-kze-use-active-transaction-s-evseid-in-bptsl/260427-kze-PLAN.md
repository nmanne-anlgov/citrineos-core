---
phase: 260427-kze
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tools/citrineos-ui/src/api.js
  - tools/citrineos-ui/src/App.jsx
  - tools/citrineos-ui/src/components/BPTSlider.jsx
autonomous: true
requirements:
  - QUICK-01

must_haves:
  truths:
    - "BPTSlider establishes its dynamic charging profile against the EVSE that the active transaction is actually on, not a hard-coded `1`"
    - "If the transaction has no evseId (older row, edge case), BPTSlider falls back to evseId=1 so the UI still functions"
    - "StartTransactionModal's user-editable evseId default of 1 is untouched"
  artifacts:
    - path: "tools/citrineos-ui/src/api.js"
      provides: "listTransactions GraphQL query selecting evseId, with fallback if Hasura column name differs"
      contains: "evseId"
    - path: "tools/citrineos-ui/src/App.jsx"
      provides: "Threading activeTx.evseId into BPTSlider as a prop"
      contains: "evseId={activeTx.evseId"
    - path: "tools/citrineos-ui/src/components/BPTSlider.jsx"
      provides: "BPTSlider accepts evseId prop and uses it (with fallback to 1) in setChargingProfile call"
      contains: "evseId"
  key_links:
    - from: "tools/citrineos-ui/src/App.jsx"
      to: "tools/citrineos-ui/src/components/BPTSlider.jsx"
      via: "evseId prop"
      pattern: "evseId={activeTx"
    - from: "tools/citrineos-ui/src/components/BPTSlider.jsx"
      to: "setChargingProfile"
      via: "argument substitution (was literal 1, now prop with fallback)"
      pattern: "setChargingProfile\\(stationId, evseId"
---

<objective>
Replace the hard-coded EVSE id of `1` in BPTSlider's `setChargingProfile` call with the EVSE id of the currently active transaction. The transaction's EVSE id flows from the GraphQL `listTransactions` query through App.jsx's `activeTx` state into BPTSlider as a prop. A safe fallback of `1` is kept for transactions that lack `evseId`.

Purpose: BPTSlider currently establishes its CentralSetpoint TxProfile on EVSE 1 regardless of which EVSE the EV is actually plugged into. On a multi-EVSE charger this targets the wrong EVSE, the profile is rejected/ignored, and the slider does nothing. Driving the call from `activeTx.evseId` keeps the slider tied to whatever EVSE the user actually started a transaction on.

Output: Updated `api.js`, `App.jsx`, and `BPTSlider.jsx` so the V2X discharge slider works on any EVSE, not just EVSE 1.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@tools/citrineos-ui/src/api.js
@tools/citrineos-ui/src/App.jsx
@tools/citrineos-ui/src/components/BPTSlider.jsx

<interfaces>
Verified facts about the Transaction model and the BPT UI conventions.
The executor should rely on these directly — no further codebase exploration needed.

From `01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts` (lines 60-62):

```ts
@ForeignKey(() => Evse)
@Column(DataType.INTEGER)
declare evseId?: number;
```

Hasura exposes Sequelize columns by their JS field name. The other fields already
queried in `listTransactions` (`transactionId`, `stationId`, `isActive`,
`chargingState`, `stoppedReason`, `totalKwh`, `createdAt`, `updatedAt`) all use
camelCase, so the Hasura column is `evseId` (camelCase). It is nullable (`?: number`).

From `tools/citrineos-ui/src/api.js`:
- `listTransactions(stationId)` already has a try/catch fallback pattern; the strict
  query selects the full column set, the fallback selects a smaller subset. Add `evseId`
  to the strict query only — leave the fallback minimal so it still succeeds if Hasura
  doesn't expose the column for some reason.
- `setChargingProfile(stationId, evseId, profile, version)` is the function consuming
  the EVSE id at line 187.

From `tools/citrineos-ui/src/App.jsx`:
- `activeTx` is set from `getLatestActiveTransaction(nextId)` on line 47 and rendered
  into `BPTSlider` on lines 154-158 with props `stationId`, `transactionId`, `onLog`.
  This is where the new `evseId` prop is added.

From `tools/citrineos-ui/src/components/BPTSlider.jsx`:
- Line 19 is the function signature: `function BPTSlider({ stationId, transactionId, onLog })`
- Line 45 is the call site: `setChargingProfile(stationId, 1, profile, '2.1')`
- The `useEffect` deps array on line 60 is `[stationId, transactionId]` — `evseId` must
  be added so a transaction restart on a different EVSE re-establishes the profile.

Coding conventions for this directory (per CLAUDE.md, but note this is JSX + Vite, NOT
TypeScript):
- Single quotes, semicolons, trailing commas, 2-space indent (Prettier).
- React function components, hooks-style (`useState`, `useEffect`, `useRef`).
- File extensions in imports are NOT required for the Vite tree (`.js`/`.jsx`).

DO NOT TOUCH:
- `tools/citrineos-ui/src/components/StartTransactionModal.jsx` — its `useState(1)`
  default for evseId is intentional (user-editable for the start-transaction form).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Thread activeTx.evseId from GraphQL query through App.jsx into BPTSlider</name>
  <files>tools/citrineos-ui/src/api.js, tools/citrineos-ui/src/App.jsx, tools/citrineos-ui/src/components/BPTSlider.jsx</files>
  <action>
Make three coordinated edits so the BPTSlider's setChargingProfile call uses the
active transaction's evseId instead of a hard-coded `1`.

Edit 1 — `tools/citrineos-ui/src/api.js`, function `listTransactions(stationId)` (lines 47-83):
Add `evseId` to the strict selection set in the primary query (between `stationId`
and `isActive` is fine). Leave the fallback query unchanged (without `evseId`) so
it still succeeds if Hasura is misconfigured and the strict query throws — the
fallback path then returns transactions without `evseId` and BPTSlider's
downstream `?? 1` fallback will engage. Final strict selection set, in order:
`transactionId, stationId, evseId, isActive, chargingState, stoppedReason,
totalKwh, createdAt, updatedAt`.

Edit 2 — `tools/citrineos-ui/src/App.jsx` (lines 154-158):
Pass `evseId={activeTx.evseId}` to the `<BPTSlider />` element. The component
already receives `stationId`, `transactionId`, and `onLog`; add `evseId` between
`transactionId` and `onLog`. Do not change any state or refresh logic — `activeTx`
already comes from `getLatestActiveTransaction` which calls the updated
`listTransactions`.

Edit 3 — `tools/citrineos-ui/src/components/BPTSlider.jsx`:
- Line 19: extend the props destructuring to include `evseId`:
  `export default function BPTSlider({ stationId, transactionId, evseId, onLog })`.
- Line 45: replace `setChargingProfile(stationId, 1, profile, '2.1')` with
  `setChargingProfile(stationId, evseId ?? 1, profile, '2.1')`. The `?? 1`
  fallback covers the case where the GraphQL fallback query returned a
  transaction without an `evseId` field, or where the column is null in the DB.
- Line 60: extend the `useEffect` deps array from `[stationId, transactionId]`
  to `[stationId, transactionId, evseId]` so a switch to a different
  EVSE/transaction re-establishes a fresh profile against the right EVSE.

Do NOT modify `StartTransactionModal.jsx` — its `useState(1)` for evseId is
intentional and user-editable.

Style: follow Prettier defaults already in use (single quotes, semicolons,
trailing commas, 2-space indent). This is JSX + Vite, NOT TypeScript — do not
add type annotations or change file extensions.
  </action>
  <verify>
    <automated>grep -nE "evseId" tools/citrineos-ui/src/api.js tools/citrineos-ui/src/App.jsx tools/citrineos-ui/src/components/BPTSlider.jsx && grep -nE "setChargingProfile\(stationId, evseId \?\? 1, profile" tools/citrineos-ui/src/components/BPTSlider.jsx && grep -nE "evseId={activeTx\.evseId}" tools/citrineos-ui/src/App.jsx && ! grep -nE "setChargingProfile\(stationId, 1, profile" tools/citrineos-ui/src/components/BPTSlider.jsx</automated>
  </verify>
  <done>
    - `tools/citrineos-ui/src/api.js` strict `listTransactions` query selects `evseId`; fallback unchanged.
    - `tools/citrineos-ui/src/App.jsx` passes `evseId={activeTx.evseId}` to `BPTSlider`.
    - `tools/citrineos-ui/src/components/BPTSlider.jsx` accepts `evseId` prop, uses `evseId ?? 1` in `setChargingProfile`, and includes `evseId` in the establishing-effect deps.
    - The literal `setChargingProfile(stationId, 1, profile,` no longer appears in `BPTSlider.jsx`.
    - `StartTransactionModal.jsx` is unchanged.
  </done>
</task>

</tasks>

<verification>
Manual smoke (optional, post-execution):
1. Start a transaction on EVSE 2 via `StartTransactionModal` (set evseId=2).
2. Watch BPTSlider's `onLog` toast — it should report `Established A-based profile id=…`
   without an error, and the underlying CSMS log should show `setChargingProfile`
   targeting `evseId: 2`, not `1`.
3. Move the slider — UpdateDynamicSchedule should reach the EV on EVSE 2.
4. Stop transaction, start a new one on EVSE 1 — BPTSlider re-establishes a fresh
   profile against EVSE 1 (the deps-array change ensures the effect re-runs).
</verification>

<success_criteria>
- BPTSlider's `setChargingProfile` call site uses the active transaction's `evseId`
  instead of literal `1`, with `?? 1` as a defensive fallback.
- `listTransactions` returns `evseId` for each transaction (when the strict query
  succeeds).
- App.jsx threads `activeTx.evseId` into BPTSlider as a prop.
- ESLint/Prettier remain clean on the three touched files.
- `StartTransactionModal.jsx` is unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/260427-kze-use-active-transaction-s-evseid-in-bptsl/260427-kze-01-SUMMARY.md`.
</output>
