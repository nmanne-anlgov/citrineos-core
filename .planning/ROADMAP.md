# Roadmap: CitrineOS OCPP 2.1 V2X Discharge Testing

## Overview

This roadmap delivers end-to-end V2X discharge capability in CitrineOS by fixing foundational validation and energy accounting bugs in the base layer, then extending the SmartCharging and EVDriver modules to handle bidirectional power transfer, and finally validating the complete flow with a connection guide. The work is surgical -- no new modules or infrastructure, just targeted fixes and extensions to the existing codebase on the `feature/ocpp-2.1` branch.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation Fixes** - Fix validation bug, add missing DTO enums, and extend MeterValueUtils for export measurands
- [ ] **Phase 2: V2X Module Handlers** - Extend SmartCharging for BPT modes and discharge profiles, configure EVDriver routing
- [ ] **Phase 3: Integration and Connection Guide** - Validate end-to-end V2X discharge flow and document how to connect a 2.1 station client

## Phase Details

### Phase 1: Foundation Fixes
**Goal**: The base layer correctly validates OCPP 2.1 requests, accepts V2X-related enum values, and accounts for bidirectional energy
**Depends on**: Nothing (first phase)
**Requirements**: VALID-01, VALID-02, VALID-03, ENRGY-01, ENRGY-02
**Success Criteria** (what must be TRUE):
  1. An OCPP 2.1 request sent to CitrineOS is validated against the request schema (not the response schema)
  2. A TransactionEvent with chargingState "Discharging" passes DTO validation without error
  3. MeterValues containing Energy.Active.Export.Register and Display/Setpoint measurands pass DTO validation
  4. MeterValueUtils correctly computes net energy (import minus export) for a session with bidirectional power flow
**Plans:** 2 plans
Plans:
- [ ] 01-01-PLAN.md -- Fix OCPPValidator 2.1 schema bug, add Discharging to ChargingState enums, add V2X measurands
- [ ] 01-02-PLAN.md -- Add export energy handling to MeterValueUtils and bidirectional net energy calculation

### Phase 2: V2X Module Handlers
**Goal**: The SmartCharging module accepts V2X charging needs, generates discharge-aware profiles, and the EVDriver module is configured to route NotifyAllowedEnergyTransfer
**Depends on**: Phase 1
**Requirements**: SMART-01, SMART-02, SMART-03, SMART-04, EVDRV-01
**Success Criteria** (what must be TRUE):
  1. A NotifyEVChargingNeeds request with AC_BPT or DC_BPT energy transfer mode is accepted (not rejected)
  2. V2XChargingParametersType fields (maxDischargePower, minDischargePower, etc.) are read and used by the handler
  3. The profile calculator generates a ChargingProfile with dischargeLimit and setpoint fields for BPT modes
  4. A ChargingProfile with discharge fields survives persistence and retrieval without losing dischargeLimit or setpoint values
  5. NotifyAllowedEnergyTransfer action appears in EVDriver module routing config for all deployment configurations
**Plans**: TBD

### Phase 3: Integration and Connection Guide
**Goal**: A charging station client can connect to CitrineOS over OCPP 2.1 and execute a complete V2X discharge session, with clear documentation of how to do so
**Depends on**: Phase 2
**Requirements**: GUIDE-01
**Success Criteria** (what must be TRUE):
  1. Documentation exists that explains WebSocket URL, subprotocol selection, authentication, and Docker setup for connecting an OCPP 2.1 station client
  2. The guide includes the V2X discharge message sequence (BootNotification through TransactionEvent Ended) with expected CSMS responses
  3. A developer following the guide can connect a station client to the running CitrineOS instance and send V2X-related messages
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation Fixes | 0/2 | Planning complete | - |
| 2. V2X Module Handlers | 0/0 | Not started | - |
| 3. Integration and Connection Guide | 0/0 | Not started | - |

### Phase 4: Fix unbound this._module.sendCall in OCPP 2.x MessageApi packageGroupCall callsites

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 3
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 4 to break down)
