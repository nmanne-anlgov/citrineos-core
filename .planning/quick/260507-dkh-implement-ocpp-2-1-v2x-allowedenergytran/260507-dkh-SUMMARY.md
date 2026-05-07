# Quick Task 260507-dkh: Implement OCPP 2.1 V2X allowedEnergyTransfer Support

**Completed:** 2026-05-07
**Status:** Done

## What Was Done

### Task 1 — Transaction model + migration (`008c8b88`)
- Added `allowedEnergyTransfer` (JSONB, nullable) and `evccId` (STRING, nullable) columns to `Transaction` Sequelize model
- Added corresponding fields to `TransactionDto` interface in `00_Base`
- Created migration `migrations/20260507000000-add-v2x-fields-to-transactions.ts`

### Task 2 — AuthorizeResponse + TransactionEvent Started (`5cec047e`)
- In `_handleAuthorize` (EVDriver module): populated `allowedEnergyTransfer: ["DC"]` at every Accepted exit point when `message.protocol === 'ocpp2.1'`
- In `_handleTransactionEvent` (Transactions module): at Started event, extracts EVCCID from `idToken.additionalInfo` for Central token type and persists `evccId` + `allowedEnergyTransfer: ["DC"]` on the transaction record

### Task 3 — NotifyAllowedEnergyTransfer REST endpoint (`538561b9`)
- Added `@AsMessageEndpoint(OCPP_CallAction.NotifyAllowedEnergyTransfer)` to `EVDriverOcpp2Api` in `2/MessageApi.ts`
- Endpoint updates the transaction's `allowedEnergyTransfer` in the DB then sends the OCPP 2.1 message to the charger via `sendCall`

## Files Changed
- `00_Base/src/interfaces/dto/transaction.dto.ts`
- `01_Data/src/layers/sequelize/model/TransactionEvent/Transaction.ts`
- `03_Modules/EVDriver/src/module/module.ts`
- `03_Modules/EVDriver/src/module/2/MessageApi.ts`
- `03_Modules/Transactions/src/module/module.ts`
- `migrations/20260507000000-add-v2x-fields-to-transactions.ts` (new)

## Deferred / Manual Steps
- DB migration must be run against the live Postgres instance (`DB_STRATEGY=migrate` or manual `sequelize-cli db:migrate`)
- End-to-end smoke test: connect OCPP 2.1 charger, trigger Authorize, verify `allowedEnergyTransfer: ["DC"]` in response; then call REST endpoint and verify charger receives `NotifyAllowedEnergyTransfer`
