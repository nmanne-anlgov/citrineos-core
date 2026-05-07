---
phase: 260507-dkh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - 00_Base/src/interfaces/dto/transaction.dto.ts
  - 01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts
  - migrations/20260507000000-add-v2x-fields-to-transactions.ts
  - 03_Modules/EVDriver/src/module/module.ts
  - 03_Modules/EVDriver/src/module/2/MessageApi.ts
  - 03_Modules/Transactions/src/module/module.ts
autonomous: true
requirements:
  - V2X-AET-01
  - V2X-AET-02
  - V2X-AET-03
  - V2X-AET-04

must_haves:
  truths:
    - "Transaction table has allowedEnergyTransfer (JSONB) and evccId (STRING) columns after migration runs"
    - "OCPP 2.1 AuthorizeResponse always includes allowedEnergyTransfer: ['DC'] when status is Accepted"
    - "When a Started TransactionEvent is received with idToken.type === 'Central', the EVCCID from additionalInfo is persisted to transaction.evccId"
    - "Started TransactionEvent persists allowedEnergyTransfer: ['DC'] on the Transaction row"
    - "POST /ocpp/2.1/notifyAllowedEnergyTransfer accepts a NotifyAllowedEnergyTransferRequest, updates Transaction.allowedEnergyTransfer, and sends the OCPP message to the station"
  artifacts:
    - path: "migrations/20260507000000-add-v2x-fields-to-transactions.ts"
      provides: "DB migration adding allowedEnergyTransfer (JSONB nullable) + evccId (STRING nullable) to Transactions table"
      contains: "addColumn.*Transactions.*allowedEnergyTransfer"
    - path: "01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts"
      provides: "Sequelize model with @Column allowedEnergyTransfer (JSONB) and evccId (STRING)"
      contains: "allowedEnergyTransfer"
    - path: "00_Base/src/interfaces/dto/transaction.dto.ts"
      provides: "TransactionSchema includes allowedEnergyTransfer and evccId fields"
      contains: "allowedEnergyTransfer"
    - path: "03_Modules/EVDriver/src/module/module.ts"
      provides: "_handleAuthorize sets allowedEnergyTransfer on Accepted exits when protocol is ocpp2.1"
      contains: "allowedEnergyTransfer"
    - path: "03_Modules/EVDriver/src/module/2/MessageApi.ts"
      provides: "notifyAllowedEnergyTransfer @AsMessageEndpoint that updates Transaction and calls sendCall"
      contains: "NotifyAllowedEnergyTransfer"
    - path: "03_Modules/Transactions/src/module/module.ts"
      provides: "_handleTransactionEvent persists evccId + allowedEnergyTransfer on Started event"
      contains: "evccId"
  key_links:
    - from: "EVDriver _handleAuthorize Accepted exits"
      to: "OCPP2_1.AuthorizeResponse.allowedEnergyTransfer"
      via: "cast response to OCPP2_1.AuthorizeResponse and assign before sendCallResultWithMessage"
      pattern: "allowedEnergyTransfer.*OCPP2_1.EnergyTransferModeEnumType.DC"
    - from: "Transactions _handleTransactionEvent Started branch"
      to: "transactionEventRepository.updateTransactionByStationIdAndTransactionId"
      via: "after createOrUpdateTransactionByTransactionEventAndStationId, when eventType===Started"
      pattern: "updateTransactionByStationIdAndTransactionId.*evccId|allowedEnergyTransfer"
    - from: "EVDriverOcpp2Api.notifyAllowedEnergyTransfer"
      to: "this._module._transactionEventRepository.updateTransactionByStationIdAndTransactionId"
      via: "look up transaction by transactionId, update allowedEnergyTransfer, then sendCall"
      pattern: "this\\._module\\.transactionEventRepository"
    - from: "EVDriverOcpp2Api.notifyAllowedEnergyTransfer"
      to: "this._module.sendCall(... OCPPVersion.OCPP2_1 ... NotifyAllowedEnergyTransfer ...)"
      via: "after DB update, dispatch OCPP message"
      pattern: "sendCall.*OCPPVersion.OCPP2_1.*NotifyAllowedEnergyTransfer"
---

<objective>
Implement OCPP 2.1 V2X `allowedEnergyTransfer` support end-to-end so a charging station can:
1. Receive `allowedEnergyTransfer` in the AuthorizeResponse,
2. Have its EVCCID and allowed-modes persisted at transaction Start,
3. Be re-notified via a CSMS-initiated `NotifyAllowedEnergyTransfer` message that also updates the DB.

Purpose: Unblocks V2X discharge testing — without `allowedEnergyTransfer`, a 2.1 client cannot negotiate DC bidirectional power transfer.
Output: New columns on the Transaction table, AuthorizeResponse populated for ocpp2.1, Started event persists EVCCID, and a new REST/OCPP message endpoint.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Files Claude will need to read while executing
@01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts
@00_Base/src/interfaces/dto/transaction.dto.ts
@03_Modules/EVDriver/src/module/module.ts
@03_Modules/EVDriver/src/module/2/MessageApi.ts
@03_Modules/Transactions/src/module/module.ts
@01_Data/src/interfaces/repositories.ts
@01_Data/src/layers/sequelize/repository/TransactionEvent.ts
@migrations/20260204120000-add-meter-start-to-transactions.ts

<interfaces>
<!-- Verified during planning. Use directly — no codebase exploration required. -->

OCPP 2.1 NotifyAllowedEnergyTransferRequest
(00_Base/src/ocpp/model/2.1/types/NotifyAllowedEnergyTransferRequest.ts):
```ts
export interface NotifyAllowedEnergyTransferRequest extends OcppRequest {
  transactionId: string;
  allowedEnergyTransfer: [EnergyTransferModeEnumType, ...EnergyTransferModeEnumType[]];
  customData?: CustomDataType | null;
}
```

OCPP 2.1 IdTokenType.additionalInfo
(00_Base/src/ocpp/model/2.1/types/AuthorizeRequest.ts):
```ts
export interface IdTokenType {
  additionalInfo?: [AdditionalInfoType, ...AdditionalInfoType[]] | null;
  idToken: string;
  type: IdTokenEnumType;
}
export interface AdditionalInfoType {
  additionalIdToken: string;
  type: string;   // free-form; per spec EVCCID is signaled with type === "EVCCID"
}
```

EnergyTransferModeEnumType (00_Base/src/ocpp/model/2.1/enums/index.ts:478):
- enum, includes `DC`, `DC_BPT`, `AC_single_phase`, `AC_three_phase`, etc.

OCPPVersion (00_Base/src/ocpp/rpc/message.ts:49):
- OCPP2_1 = 'ocpp2.1'  → use `OCPPVersion.OCPP2_1` (preferred) or compare `message.protocol === 'ocpp2.1'`.

ITransactionEventRepository (01_Data/src/interfaces/repositories.ts:297):
```ts
updateTransactionByStationIdAndTransactionId(
  tenantId: number,
  transaction: Partial<Transaction>,
  transactionId: string,
  stationId: string,
): Promise<Transaction | undefined>;
```

EVDriverModule already exposes:
- `protected _transactionEventRepository: ITransactionEventRepository;` (module.ts:242)
- `get transactionEventRepository(): ITransactionEventRepository` (module.ts:244)
- accessed in MessageApi via `this._module.transactionEventRepository`

OCPP_CallAction.NotifyAllowedEnergyTransfer is already defined
(00_Base/src/ocpp/rpc/message.ts:119) — no enum addition needed.

Sample existing migration shape (migrations/20260204120000-add-meter-start-to-transactions.ts):
```ts
import { DataTypes, QueryInterface } from 'sequelize';
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn('Transactions', 'meterStart', {
      type: DataTypes.DECIMAL,
      allowNull: true,
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn('Transactions', 'meterStart');
  },
};
```
Table name confirmed: `'Transactions'` (plural, PascalCase).

Existing pattern for an `@AsMessageEndpoint` that calls sendCall directly
(see `requestStartTransaction` in 03_Modules/EVDriver/src/module/2/MessageApi.ts:131):
```ts
const confirmation = await this._module.sendCall(
  i, tenantId, OCPPVersion.OCPP2_0_1, OCPP_CallAction.RequestStartTransaction,
  request, callbackUrl,
);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add allowedEnergyTransfer + evccId to Transaction model, DTO, and migration</name>
  <files>
    01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts,
    00_Base/src/interfaces/dto/transaction.dto.ts,
    migrations/20260507000000-add-v2x-fields-to-transactions.ts
  </files>
  <action>
    Three coordinated changes — apply all of them, do NOT split across tasks.

    (a) `00_Base/src/interfaces/dto/transaction.dto.ts` — extend `TransactionSchema` (the `BaseSchema.extend({...})` block). Add these two fields, placed after `customData`:
    ```ts
    allowedEnergyTransfer: z.array(z.string()).nullable().optional(),
    evccId: z.string().nullable().optional(),
    ```
    Do not modify `TransactionCreateSchema.omit({...})` (the new fields are allowed in creates).

    (b) `01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts` — add two new column declarations on the `Transaction` class. Place them immediately AFTER the existing `customData` column (around line 157) and BEFORE the `tenantId` foreign key block:
    ```ts
    @Column(DataType.JSONB)
    declare allowedEnergyTransfer?: string[] | null;

    @Column(DataType.STRING)
    declare evccId?: string | null;
    ```
    The class already implements `TransactionDto`, so the DTO change in (a) is what makes TypeScript accept these. Do not change anything else in the model.

    (c) Create `migrations/20260507000000-add-v2x-fields-to-transactions.ts`. Match the import + default-export shape used in `migrations/20260204120000-add-meter-start-to-transactions.ts` exactly (including SPDX header). The migration MUST add both columns in `up` and remove both in `down`. Table name is `'Transactions'` (verified — the model is `@Table` on class `Transaction`, Sequelize pluralizes).
    ```ts
    // up
    await queryInterface.addColumn('Transactions', 'allowedEnergyTransfer', {
      type: DataTypes.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'evccId', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    // down (reverse order)
    await queryInterface.removeColumn('Transactions', 'evccId');
    await queryInterface.removeColumn('Transactions', 'allowedEnergyTransfer');
    ```

    Why JSONB (not STRING/array): the spec allows multiple modes (e.g. `["DC","DC_BPT"]`); JSONB matches the existing `customData` column choice and keeps queries flexible without an array-of-enum migration.

    Why nullable: existing rows must remain valid; OCPP 2.0.1 transactions never set these fields.
  </action>
  <verify>
    <automated>cd /home/ladmin/workspace/citrineos-core && npx tsc --build 00_Base 01_Data 2>&1 | tail -30</automated>
    Also confirm the migration file compiles (it is built by the same `tsc --build` if listed in `migrations/tsconfig*`; otherwise plain syntax-check is fine):
    `node -e "require('typescript').transpileModule(require('fs').readFileSync('migrations/20260507000000-add-v2x-fields-to-transactions.ts','utf8'),{compilerOptions:{module:'esnext',target:'es2022'}})"` exits 0.
  </verify>
  <done>
    - `TransactionSchema` exports `allowedEnergyTransfer` and `evccId` (greppable in the .ts source)
    - `Transaction` model has `@Column(DataType.JSONB) declare allowedEnergyTransfer` and `@Column(DataType.STRING) declare evccId`
    - Migration file exists at `migrations/20260507000000-add-v2x-fields-to-transactions.ts` with addColumn/removeColumn for both fields
    - `npx tsc --build 00_Base 01_Data` succeeds with zero errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Populate AuthorizeResponse.allowedEnergyTransfer for OCPP 2.1, and persist evccId + allowedEnergyTransfer on Started event</name>
  <files>
    03_Modules/EVDriver/src/module/module.ts,
    03_Modules/Transactions/src/module/module.ts
  </files>
  <action>
    Two coordinated changes (Authorize + TransactionEvent Started). Apply both.

    (A) `03_Modules/EVDriver/src/module/module.ts` — `_handleAuthorize` (starts ~line 277).
    `OCPP2_1` is already imported (verified at module.ts:31). The handler types `response` as `OCPP2_0_1.AuthorizeResponse`; for the 2.1 case we cast at the assignment site.

    Add ONE small helper near the top of the method body (immediately after `const response: OCPP2_0_1.AuthorizeResponse = { ... };`):
    ```ts
    // OCPP 2.1: when Accepted, advertise allowed energy transfer modes for V2X.
    // Defaults to ["DC"]; later phases may compute this per-Authorization.
    const is21 = message.protocol === OCPPVersion.OCPP2_1;
    const applyAet = (r: OCPP2_0_1.AuthorizeResponse) => {
      if (is21 && r.idTokenInfo.status === OCPP2_0_1.AuthorizationStatusEnumType.Accepted) {
        (r as unknown as OCPP2_1.AuthorizeResponse).allowedEnergyTransfer = [
          OCPP2_1.EnergyTransferModeEnumType.DC,
        ];
      }
    };
    ```

    Then call `applyAet(response);` IMMEDIATELY BEFORE EVERY `sendCallResultWithMessage(message, response)` call inside `_handleAuthorize`. Verified exit points (re-grep before editing in case line numbers shift):
    - line ~313 (NoAuthorization Accepted early return)
    - line ~334 (eMAID cached Accepted early return)
    - line ~357 (certificate cert-status NOT Accepted — status is Invalid here, so applyAet is a no-op; call it anyway for uniformity)
    - line ~392 (eMAID OCSP-passed Accepted early return)
    - line ~510 (no-authorization-found path — status stays Unknown; applyAet no-op, still call for uniformity)
    - line ~556 (final fall-through send)
    Rule: every `sendCallResultWithMessage(message, response)` in this method gets a preceding `applyAet(response);`. Use grep to enumerate before editing:
    `grep -n "sendCallResultWithMessage" 03_Modules/EVDriver/src/module/module.ts`
    Only the calls inside `_handleAuthorize` are in scope — leave other handlers untouched.

    Do not import anything new; `OCPPVersion`, `OCPP2_1`, and `OCPP2_0_1` are all already imported.

    (B) `03_Modules/Transactions/src/module/module.ts` — `_handleTransactionEvent` (starts ~line 284).
    The transaction is created/updated by `createOrUpdateTransactionByTransactionEventAndStationId` at line ~305. After that call (and after the FK-error catch block), when this is the Started event, persist EVCCID + DC.

    Insert this block right after `if (message.payload.reservationId) { ... }` (around line ~331) and BEFORE the `if (response) { ... }` branch:
    ```ts
    // OCPP 2.1 V2X: persist EVCCID (from idToken.additionalInfo) + default allowedEnergyTransfer
    // on transaction Start. EIM (Central) sessions carry EVCCID in additionalInfo.
    if (
      transaction &&
      transactionEvent.eventType === OCPP2_1.TransactionEventEnumType.Started
    ) {
      const updates: Partial<Transaction> = {
        allowedEnergyTransfer: ['DC'],
      };
      const idToken = transactionEvent.idToken;
      if (idToken && idToken.type === OCPP2_0_1.IdTokenEnumType.Central && idToken.additionalInfo) {
        const evccEntry = idToken.additionalInfo.find((info: any) => info.type === 'EVCCID');
        if (evccEntry?.additionalIdToken) {
          updates.evccId = evccEntry.additionalIdToken;
        }
      }
      await this._transactionEventRepository.updateTransactionByStationIdAndTransactionId(
        tenantId,
        updates,
        transactionId,
        stationId,
      );
    }
    ```
    Notes:
    - `OCPP2_0_1.IdTokenEnumType.Central` exists (verified in `00_Base/src/ocpp/model/2.0.1/enums/IdTokenEnumType.ts:11`); the 2.1 namespace also has `Central` (enums/index.ts).
    - `OCPP2_1` and `OCPP2_0_1` are already imported in this file (used elsewhere in the same handler).
    - `Transaction` is already imported (it is the return type of `createOrUpdateTransactionByTransactionEventAndStationId`).
    - The cast `(info: any)` avoids needing to import `AdditionalInfoType`.
    - `this._transactionEventRepository` already exists on the class (used elsewhere in this file, e.g. line 403).
    - This is a fire-and-forget-style update placed BEFORE the response is sent so a Newman test can observe the persisted row by the time the OCPP response returns.
  </action>
  <verify>
    <automated>cd /home/ladmin/workspace/citrineos-core && npx tsc --build 03_Modules/EVDriver 03_Modules/Transactions 2>&1 | tail -30</automated>
    Also verify every Authorize exit path got the helper:
    `grep -c "applyAet(response);" 03_Modules/EVDriver/src/module/module.ts` should equal `grep -c "sendCallResultWithMessage(message, response)" 03_Modules/EVDriver/src/module/module.ts` for the lines inside `_handleAuthorize` (eyeball the diff if counts differ — other handlers may also call sendCallResultWithMessage with a different `response` variable).
  </verify>
  <done>
    - `_handleAuthorize` defines `applyAet` once and calls it before every in-method `sendCallResultWithMessage`
    - For an `ocpp2.1` Accepted response, the AuthorizeResponse JSON contains `allowedEnergyTransfer: ["DC"]`; for `ocpp2.0.1` it does NOT
    - On a Started TransactionEventRequest with `idToken.type === "Central"` and `additionalInfo[].type === "EVCCID"`, `Transaction.evccId` and `Transaction.allowedEnergyTransfer` are persisted
    - `npx tsc --build 03_Modules/EVDriver 03_Modules/Transactions` succeeds with zero errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Add NotifyAllowedEnergyTransfer @AsMessageEndpoint to EVDriver MessageApi</name>
  <files>
    03_Modules/EVDriver/src/module/2/MessageApi.ts
  </files>
  <action>
    Add a new endpoint to the existing `EVDriverOcpp2Api` class. Follow the same shape as `requestStartTransaction` (line ~46) — direct `this._module.sendCall` (NOT `packageGroupCall`), because we want to do per-station DB updates first.

    (1) Update imports at the top of the file. Currently:
    ```ts
    import {
      AbstractModuleApi, AsMessageEndpoint, DEFAULT_TENANT_ID, getOcpp2Schema,
      OCPP2_0_1, OCPP2_request_types, OCPP_CallAction, OCPPVersion,
    } from '@citrineos/base';
    ```
    Add `OCPP2_1` to that import list:
    ```ts
    import {
      AbstractModuleApi, AsMessageEndpoint, DEFAULT_TENANT_ID, getOcpp2Schema,
      OCPP2_0_1, OCPP2_1, OCPP2_request_types, OCPP_CallAction, OCPPVersion,
    } from '@citrineos/base';
    ```

    (2) Add the new endpoint method. Place it AFTER `requestStopTransaction` and BEFORE `cancelReservation` (so 2.1-only endpoints group together below the shared 2.0.1/2.1 ones):
    ```ts
    @AsMessageEndpoint(
      OCPP_CallAction.NotifyAllowedEnergyTransfer,
      () => OCPP2_1.NotifyAllowedEnergyTransferRequestSchema,
    )
    async notifyAllowedEnergyTransfer(
      identifier: string[],
      request: OCPP2_1.NotifyAllowedEnergyTransferRequest,
      callbackUrl?: string,
      tenantId: number = DEFAULT_TENANT_ID,
    ): Promise<IMessageConfirmation[]> {
      const results: IMessageConfirmation[] = [];

      for (const stationId of identifier) {
        // 1. Persist the new allowed modes BEFORE notifying the station, so the
        //    DB reflects CSMS intent even if the station is offline / send fails.
        try {
          await this._module.transactionEventRepository.updateTransactionByStationIdAndTransactionId(
            tenantId,
            { allowedEnergyTransfer: request.allowedEnergyTransfer as string[] },
            request.transactionId,
            stationId,
          );
        } catch (error) {
          this._logger.error(
            `Failed to update transaction ${request.transactionId} on ${stationId} with allowedEnergyTransfer:`,
            error,
          );
          results.push({
            success: false,
            payload: error instanceof Error ? error.message : JSON.stringify(error),
          });
          continue;
        }

        // 2. Send the OCPP 2.1 NotifyAllowedEnergyTransfer call to the station.
        try {
          const confirmation = await this._module.sendCall(
            stationId,
            tenantId,
            OCPPVersion.OCPP2_1,
            OCPP_CallAction.NotifyAllowedEnergyTransfer,
            request,
            callbackUrl,
          );
          results.push(confirmation);
        } catch (error) {
          results.push({
            success: false,
            payload: error instanceof Error ? error.message : JSON.stringify(error),
          });
        }
      }

      return results;
    }
    ```

    Verified facts (do not re-research):
    - `OCPP_CallAction.NotifyAllowedEnergyTransfer` exists (`00_Base/src/ocpp/rpc/message.ts:119`).
    - `OCPP2_1.NotifyAllowedEnergyTransferRequestSchema` is exported from `00_Base/src/ocpp/model/2.1/index.ts:303`.
    - `OCPP2_1.NotifyAllowedEnergyTransferRequest` type is exported from the same file (line 302).
    - `this._module.transactionEventRepository` is the public getter on `EVDriverModule` (module.ts:244) — already used by `requestStartTransaction` via `validateChargingProfileType`.
    - `this._module.sendCall` is invoked the same way for `RequestStartTransaction` (line ~131); use `OCPPVersion.OCPP2_1` here.
    - `this._logger` is inherited from `AbstractModuleApi`.

    Do NOT add any new repository to `EVDriverModule`'s constructor — `_transactionEventRepository` is already injected (verified module.ts:163, 194, 242-245).

    Do NOT use `packageGroupCall` — the loop body must do DB writes per identifier, which `packageGroupCall` does not support.

    Do NOT use `getOcpp2Schema(...)` for this one — that helper looks up by name string for both 2.0.1 and 2.1 variants of the same action, but `NotifyAllowedEnergyTransfer` is 2.1-only, so referencing the schema directly via `OCPP2_1.NotifyAllowedEnergyTransferRequestSchema` is both simpler and correct.
  </action>
  <verify>
    <automated>cd /home/ladmin/workspace/citrineos-core && npx tsc --build 03_Modules/EVDriver 2>&1 | tail -30</automated>
    Also: `grep -n "NotifyAllowedEnergyTransfer" 03_Modules/EVDriver/src/module/2/MessageApi.ts` shows both the decorator and the method body.
  </verify>
  <done>
    - `EVDriverOcpp2Api` has a `notifyAllowedEnergyTransfer` method decorated with `@AsMessageEndpoint(OCPP_CallAction.NotifyAllowedEnergyTransfer, ...)`
    - The method updates `Transaction.allowedEnergyTransfer` via `transactionEventRepository.updateTransactionByStationIdAndTransactionId` BEFORE sending the OCPP call
    - The OCPP call is sent via `this._module.sendCall(..., OCPPVersion.OCPP2_1, OCPP_CallAction.NotifyAllowedEnergyTransfer, request, ...)`
    - `npx tsc --build 03_Modules/EVDriver` succeeds
    - Full workspace build green: `npx tsc --build` from repo root completes with no errors
  </done>
</task>

</tasks>

<verification>
End-to-end checks (run after all tasks):

1. **Full build:** `cd /home/ladmin/workspace/citrineos-core && npx tsc --build` — exits 0.
2. **Unit tests pass for touched packages:** `npx vitest run --project @citrineos/data --project @citrineos/evdriver --project @citrineos/transactions` (or the closest equivalent — fall back to `npm test` if project filters not configured). Should not regress.
3. **Migration sanity:** start the docker stack with `DB_STRATEGY=migrate`. Verify the `Transactions` table has the two new columns:
   `docker compose exec ocpp-db psql -U citrine -d citrine -c "\d \"Transactions\"" | grep -E "allowedEnergyTransfer|evccId"`
   Should show both columns as nullable.
4. **AuthorizeResponse 2.1 smoke test:** with a 2.1 client connected on port 8083, send an Accepted Authorize. The response payload should include `"allowedEnergyTransfer":["DC"]`. Repeat with a 2.0.1 client on 8081/8082 — the response must NOT include the field.
5. **Started event smoke test:** trigger a Started TransactionEvent with `idToken.type="Central"` and an `additionalInfo` entry of `{type:"EVCCID", additionalIdToken:"DE-XYZ-12345"}`. After the event is processed, query the Transactions table — the row should have `evccId='DE-XYZ-12345'` and `allowedEnergyTransfer=["DC"]`.
6. **NotifyAllowedEnergyTransfer endpoint:** POST to `/ocpp/2.1/notifyAllowedEnergyTransfer?identifier=<stationId>&tenantId=<id>` with body `{transactionId:"<id>", allowedEnergyTransfer:["DC","DC_BPT"]}`. Response is 200 with a `success:true` confirmation, and the Transactions row's `allowedEnergyTransfer` is updated to `["DC","DC_BPT"]`.
</verification>

<success_criteria>
- All 3 tasks complete with `done` criteria met
- `npx tsc --build` is green
- The four V2X-AET requirements are demonstrably met (verification steps 4, 5, 6 above pass against a running stack; step 3 confirms schema)
- No existing OCPP 2.0.1 behavior changes (Authorize without 2.1 = no `allowedEnergyTransfer`; non-Started events ignore EVCCID)
</success_criteria>

<output>
After completion, create `.planning/quick/260507-dkh-implement-ocpp-2-1-v2x-allowedenergytran/260507-dkh-SUMMARY.md` capturing:
- Files modified (with one-line description each)
- The new migration filename and the table/columns it adds
- The exact list of `_handleAuthorize` exit points that received `applyAet(response);`
- Any deviations from this plan (e.g. if a different repository method was used)
- Manual verification results (steps 3-6 of `<verification>`)
</output>
