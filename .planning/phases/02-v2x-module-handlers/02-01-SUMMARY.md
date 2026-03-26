---
phase: 02-v2x-module-handlers
plan: 01
status: complete
started: 2026-03-26
completed: 2026-03-26
---

# Plan 02-01: SmartCharging BPT Acceptance + Discharge Profiles — Summary

## What Was Built

Extended the NotifyEVChargingNeeds handler to accept V2X BPT energy transfer modes (AC_BPT, DC_BPT, AC_BPT_DER, DC_ACDP_BPT) and v2xChargingParameters. Migrated InternalSmartCharging from OCPP2_0_1 to OCPP2_1 types and added BPT switch cases that generate discharge-aware ChargingProfiles with dischargeLimit set to negative maxDischargePower.

## Key Files

### Modified

- `03_Modules/SmartCharging/src/module/module.ts` — Broadened validation to accept BPT modes + v2xChargingParameters
- `03_Modules/SmartCharging/src/module/smartCharging/InternalSmartCharging.ts` — Migrated to OCPP2_1 types, added AC_BPT/DC_BPT cases with dischargeLimit

## Verification

- TypeScript base compiles clean
- Existing AC/DC paths unchanged
- BPT cases set dischargeLimit from v2xChargingParameters.maxDischargePower

## Self-Check: PASSED
