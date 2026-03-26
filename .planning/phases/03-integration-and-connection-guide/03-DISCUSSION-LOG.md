# Phase 3: Integration and Connection Guide - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 03-integration-and-connection-guide
**Areas discussed:** Guide format & location, Message sequence detail, Example scenario values, Validation approach

---

## Guide Format & Location

| Option                | Description                                                           | Selected |
| --------------------- | --------------------------------------------------------------------- | -------- |
| Standalone docs/ file | New docs/v2x-discharge-guide.md -- separate from README, easy to find | ✓        |
| Section in README.md  | Add section alongside EVerest testing. README already long.           |          |
| You decide            | Claude picks based on repo conventions                                |          |

**User's choice:** Standalone docs/ file
**Notes:** None

| Option             | Description                                                    | Selected |
| ------------------ | -------------------------------------------------------------- | -------- |
| Docker only        | Focus on docker compose workflow. Simpler, more reliable.      | ✓        |
| Docker + local dev | Include both Docker and npm run start paths. More to maintain. |          |
| You decide         | Claude picks based on project constraints                      |          |

**User's choice:** Docker only
**Notes:** Aligns with project constraint of Docker-based deployment

---

## Message Sequence Detail

| Option                     | Description                                                     | Selected |
| -------------------------- | --------------------------------------------------------------- | -------- |
| Full JSON examples         | Complete request/response JSON for each step. Copy-paste ready. | ✓        |
| Annotated sequence diagram | ASCII/Mermaid diagram with brief field descriptions. Lighter.   |          |
| Action names + key fields  | Table of actions with key V2X fields highlighted. Minimal.      |          |

**User's choice:** Full JSON examples
**Notes:** None

| Option                | Description                                                                | Selected |
| --------------------- | -------------------------------------------------------------------------- | -------- |
| Full flow (all steps) | All messages including StatusNotification, Authorize, multiple MeterValues | ✓        |
| Core V2X steps only   | Skip StatusNotification and Authorize, focus on V2X-specific messages      |          |
| You decide            | Claude picks based on V2X validation needs                                 |          |

**User's choice:** Full flow (all steps)
**Notes:** Complete BootNotification through TransactionEvent Ended

| Option                | Description                                                         | Selected |
| --------------------- | ------------------------------------------------------------------- | -------- |
| Both directions       | Station request AND expected CitrineOS response for each step       | ✓        |
| Station requests only | Only document what the station sends. Responses implicit from spec. |          |

**User's choice:** Both directions
**Notes:** Developer knows exactly what to expect from CitrineOS

---

## Example Scenario Values

| Option            | Description                                                       | Selected |
| ----------------- | ----------------------------------------------------------------- | -------- |
| Residential V2H   | ~7kW AC discharge, modest energy (10 kWh). Relatable.             |          |
| Commercial V2G DC | ~50kW DC discharge, larger energy values. Exercises DC_BPT paths. | ✓        |
| You decide        | Claude picks realistic values for V2X code paths                  |          |

**User's choice:** Commercial V2G DC
**Notes:** Exercises DC_BPT energy transfer mode added in Phase 2

| Option                               | Description                                           | Selected |
| ------------------------------------ | ----------------------------------------------------- | -------- |
| Generic (e.g., "CS001")              | Simple, works with allowUnknownChargingStations: true | ✓        |
| Descriptive (e.g., "V2X-DC-TEST-01") | Self-documenting station ID                           |          |
| You decide                           | Claude picks sensible default                         |          |

**User's choice:** Generic ("CS001")
**Notes:** None

---

## Validation Approach

| Option              | Description                                                            | Selected |
| ------------------- | ---------------------------------------------------------------------- | -------- |
| wscat commands      | Copy-paste wscat commands for each step. Lightweight.                  | ✓        |
| Node.js test script | Small script that sends full V2X flow automatically. More to maintain. |          |
| Documentation only  | Pure prose with JSON. Developer uses own tooling.                      |          |

**User's choice:** wscat commands
**Notes:** None

| Option                             | Description                                            | Selected |
| ---------------------------------- | ------------------------------------------------------ | -------- |
| Yes, brief troubleshooting section | 3-5 common issues and solutions. Saves developer time. | ✓        |
| No, keep it lean                   | Just happy path. Issues from error messages.           |          |
| You decide                         | Claude decides based on Docker/WebSocket gotchas       |          |

**User's choice:** Brief troubleshooting section
**Notes:** Cover wrong subprotocol, Docker networking, WebSocket upgrade failures

---

## Claude's Discretion

- Exact power/energy numeric values for DC V2G scenario
- EVSE and connector ID numbering
- Ordering of troubleshooting tips
- Whether to include architecture diagram
- Message correlation ID format

## Deferred Ideas

None -- discussion stayed within phase scope
