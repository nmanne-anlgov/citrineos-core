# Phase 2: V2X Module Handlers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 02-v2x-module-handlers
**Areas discussed:** Discharge profile, V2X params handling, Config routing scope

---

## Discharge Profile Calculation

| Option           | Description                                             | Selected |
| ---------------- | ------------------------------------------------------- | -------- |
| Simple max-power | Set dischargeLimit to maxDischargePower from V2X params | ✓        |
| Constraint-based | Apply energy/time constraints from V2X params           |          |
| You decide       | Claude picks based on what's needed                     |          |

**User's choice:** Simple max-power
**Notes:** Enough to validate the flow works end-to-end. Not production-ready.

---

## V2X Parameters Handling

| Option            | Description                                           | Selected |
| ----------------- | ----------------------------------------------------- | -------- |
| Pass-through only | Read V2X params for profile calc, don't persist to DB | ✓        |
| Persist as JSONB  | Add v2xChargingParameters column now                  |          |

**User's choice:** Pass-through only
**Notes:** Data model changes deferred to v2.

---

## NotifyAllowedEnergyTransfer Config Routing

| Option                | Description                                               | Selected |
| --------------------- | --------------------------------------------------------- | -------- |
| Config + stub handler | Add routing config AND minimal handler returning Accepted | ✓        |
| Config only           | Just routing entries, station gets NotSupported           |          |

**User's choice:** Config + stub handler
**Notes:** Station gets a valid Accepted response.

## Claude's Discretion

- ChargingProfile mapper fix approach
- SmartCharging test coverage
- Stub handler response format

## Deferred Ideas

None.
