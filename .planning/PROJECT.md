# CitrineOS OCPP 2.1 V2X Discharge Testing

## What This Is

A focused effort to validate and complete CitrineOS's CSMS-side support for OCPP 2.1 bidirectional power transfer (V2X discharge), enabling a charging station client to connect via WebSocket and execute a full V2X discharge flow. The deliverable is a gap analysis, any necessary fixes, and a working test setup with connection guide.

## Core Value

A charging station client can connect to CitrineOS over OCPP 2.1 and successfully execute a V2X discharge session end-to-end.

## Requirements

### Validated

- ✓ OCPP 2.1 WebSocket endpoint available (port 8083, security profile 0) — existing
- ✓ OCPP message routing and validation infrastructure — existing
- ✓ Transaction lifecycle management (start/stop/meter values) — existing
- ✓ Module-based handler architecture with decorator-driven dispatch — existing
- ✓ Docker Compose deployment with PostgreSQL, RabbitMQ, MinIO — existing
- ✓ Multi-version OCPP support (1.6, 2.0.1, 2.1 subprotocols) — existing

### Active

- [ ] CSMS handles V2X discharge TransactionEvent messages (negative power/energy values)
- [ ] CSMS correctly processes bidirectional power measurands in MeterValues
- [ ] CSMS supports NotifyEVChargingNeeds with V2X/discharge parameters
- [ ] CSMS handles RequestStartTransaction / RequestStopTransaction for discharge sessions
- [ ] Connection guide documents how to connect a 2.1 charging station client to CitrineOS
- [ ] Test harness or example flow demonstrates V2X discharge end-to-end

### Out of Scope

- OCPP 2.1 features unrelated to bidirectional power — not the focus of this effort
- Production deployment or performance testing — this is dev/test validation
- Charging station client implementation — user has their own client
- ISO 15118 / Plug&Charge integration — separate concern
- Smart charging profile optimization for V2X — future work

## Context

- Working on `feature/ocpp-2.1` branch with partial 2.1 support already merged
- CitrineOS is a modular monolith CSMS with 9 functional modules communicating via RabbitMQ
- Key modules for this work: Transactions, EVDriver, SmartCharging
- User has their own charging station client acting as the OCPP 2.1 station
- Running CitrineOS via Docker Compose
- OCPP 2.1 introduces bidirectional power transfer support with new measurands, transaction types, and EV charging needs parameters

## Constraints

- **Branch**: Must work on `feature/ocpp-2.1` branch — not main
- **Protocol**: OCPP 2.1 specifically (not 2.0.1 backward compatibility)
- **Environment**: Docker-based deployment
- **Scope**: Single flow (V2X discharge) — not full 2.1 feature coverage

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Focus on V2X discharge only | User needs to validate one specific flow, not full 2.1 coverage | — Pending |
| Docker deployment | User's preferred environment | — Pending |
| Gap analysis before fixes | Understand what exists before implementing | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after initialization*
