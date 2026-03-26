---
status: partial
phase: 03-integration-and-connection-guide
source: [03-VERIFICATION.md]
started: 2026-03-26T18:30:00.000Z
updated: 2026-03-26T18:30:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live BootNotification

expected: `wscat -c ws://localhost:8083/CS001 -s ocpp2.1` then send Step 1 JSON; expected `status: "Accepted"` CallResult
result: [pending]

### 2. Live StatusNotification

expected: Send Step 2 JSON; expected empty CallResult `[3, "status-1", {}]`
result: [pending]

### 3. NotifyEVChargingNeeds Rejected path

expected: Send Step 5 without a prior transaction; expected `status: "Rejected"`
result: [pending]

### 4. Handler matrix accuracy cross-check

expected: Confirm Authorize/TransactionEvent/MeterValues are actually only registered for OCPP2_0_1 in the current source
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
