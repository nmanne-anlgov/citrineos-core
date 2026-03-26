# Phase 2: V2X Module Handlers - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the SmartCharging module to accept BPT energy transfer modes and V2X charging parameters in NotifyEVChargingNeeds, generate discharge-aware ChargingProfiles with dischargeLimit/setpoint fields, and ensure profiles survive persistence. Configure EVDriver module to route NotifyAllowedEnergyTransfer with a stub handler. This phase modifies `03_Modules/SmartCharging` and `03_Modules/EVDriver` plus server config files.

</domain>

<decisions>
## Implementation Decisions

### Discharge Profile Calculation

- **D-01:** Use simple max-power approach for BPT profile calculation — set `dischargeLimit` to `maxDischargePower` from V2XChargingParametersType. No constraint-based optimization.
- **D-02:** For BPT modes, generate a ChargingProfile with `chargingRateUnit: W` and `dischargeLimit` set to the V2X max discharge power. Keep it minimal — enough to validate the flow works end-to-end.

### V2X Parameters Handling

- **D-03:** Pass-through only — read V2XChargingParametersType fields from the NotifyEVChargingNeeds request to use in profile calculation, but do NOT persist them to the database. Data model changes (ChargingNeeds JSONB columns) are deferred to v2.
- **D-04:** The NotifyEVChargingNeeds handler validation must be updated to accept requests that have `v2xChargingParameters` (in addition to existing `acChargingParameters`/`dcChargingParameters`).

### NotifyAllowedEnergyTransfer Configuration

- **D-05:** Add routing config entries AND a minimal stub handler in EVDriver that returns `Accepted` status. The station gets a valid response confirming BPT is permitted.
- **D-06:** Config entries must be added to all three deployment configs: `docker.ts`, `local.ts`, and `swarm.docker.ts`.

### Claude's Discretion

- ChargingProfile mapper fix approach — how to preserve `dischargeLimit` and `setpoint` fields through persistence (may need a 2.1-aware mapper or JSONB storage of schedule periods)
- Whether to add SmartCharging tests (zero coverage currently) — add if straightforward
- Exact stub handler response format for NotifyAllowedEnergyTransfer

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SmartCharging Handler

- `03_Modules/SmartCharging/src/module/module.ts` — NotifyEVChargingNeeds handler (lines 190-230), validation logic that rejects V2X at lines 197-210
- `03_Modules/SmartCharging/src/module/smartCharging/InternalSmartCharging.ts` — calculateChargingProfile method (line 35), BPT throw at line 99-100, uses OCPP2_0_1 types
- `03_Modules/SmartCharging/src/module/smartCharging/SmartCharging.ts` — ISmartCharging interface (calculateChargingProfile signature)

### ChargingProfile Persistence

- `01_Data/src/layers/sequelize/model/ChargingProfile/` — ChargingProfile, ChargingSchedule, ChargingSchedulePeriod models
- `01_Data/src/layers/sequelize/mapper/` — Mappers that may strip 2.1 fields (dischargeLimit, setpoint)

### EVDriver Module

- `03_Modules/EVDriver/src/module/module.ts` — EVDriver module handler registrations
- `00_Base/src/ocpp/model/2.1/types/NotifyAllowedEnergyTransferRequest.ts` — Request type
- `00_Base/src/ocpp/model/2.1/types/NotifyAllowedEnergyTransferResponse.ts` — Response type

### Server Config (routing)

- `Server/src/config/envs/docker.ts` — Module action routing for Docker deployment
- `Server/src/config/envs/local.ts` — Module action routing for local development
- `Server/src/config/envs/swarm.docker.ts` — Module action routing for swarm deployment (if exists)

### OCPP 2.1 V2X Types (in 00_Base)

- `00_Base/src/ocpp/model/2.1/enums/index.ts` — EnergyTransferModeEnumType (BPT values), OperationModeEnumType
- `00_Base/src/ocpp/model/2.1/types/` — V2XChargingParametersType, ChargingProfileType with dischargeLimit/setpoint

### Research

- `.planning/research/SUMMARY.md` — Gap analysis, implementation order, risk assessment
- `.planning/research/ARCHITECTURE.md` — Module responsibility mapping

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `InternalSmartCharging` class already has the profile calculation structure — just needs BPT cases added to the switch statement
- `_getChargingRateUnitAndLimit` helper method exists for DC params — can model a similar approach for V2X
- `@AsHandler` decorator pattern well-established — EVDriver stub handler follows same pattern

### Established Patterns

- Module handlers use `@AsHandler([OCPPVersion.OCPP2_0_1, OCPPVersion.OCPP2_1], action)` or version-specific arrays
- Config routing uses `EventGroup` enum to map actions to modules via RabbitMQ queues
- Profile calculation returns `OCPP2_0_1.ChargingProfileType` — may need to accept `OCPP2_1.ChargingProfileType` for dischargeLimit/setpoint

### Integration Points

- SmartCharging module.ts handler at line 197 — validation check must be extended for V2X
- InternalSmartCharging switch statement at line 71 — needs BPT cases
- Server config `evdriver.responses` array — needs NotifyAllowedEnergyTransfer action
- ChargingProfile mapper — must preserve 2.1 fields through persistence cycle

</code_context>

<specifics>
## Specific Ideas

- Keep the BPT profile calculation as simple as possible — this is validation, not production-ready smart charging
- The stub handler for NotifyAllowedEnergyTransfer should just return Accepted so the station flow doesn't block

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 02-v2x-module-handlers_
_Context gathered: 2026-03-26_
