# Phase 3: Integration and Connection Guide - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a comprehensive V2X discharge connection guide that documents how to connect an OCPP 2.1 charging station client to CitrineOS via Docker, execute a complete V2X discharge session, and validate each step. This phase produces documentation only -- no code changes to the CitrineOS codebase.

</domain>

<decisions>
## Implementation Decisions

### Guide Format & Location

- **D-01:** Create a standalone markdown file at `docs/v2x-discharge-guide.md`. No existing `docs/` directory -- create it.
- **D-02:** Docker-only setup instructions. No local development path. The project constraint is Docker-based deployment.

### Message Sequence Detail

- **D-03:** Full JSON request/response examples for every message in the sequence. Developer can copy-paste into their client.
- **D-04:** Include the complete flow: BootNotification -> StatusNotification -> Authorize -> TransactionEvent (Started) -> NotifyEVChargingNeeds -> NotifyAllowedEnergyTransfer -> MeterValues (discharge) -> TransactionEvent (Updated) -> TransactionEvent (Ended).
- **D-05:** Document both directions -- station request AND expected CitrineOS response for each step.

### Example Scenario Values

- **D-06:** Commercial V2G DC scenario: ~50kW DC discharge, larger energy values. Exercises DC_BPT energy transfer mode code paths from Phase 2.
- **D-07:** Generic station ID convention (e.g., "CS001"). Works with the default Docker config's `allowUnknownChargingStations: true`.

### Validation Approach

- **D-08:** Include copy-paste `wscat` commands for each message step. Lightweight, no custom tooling needed.
- **D-09:** Include a brief troubleshooting section (3-5 common issues) covering wrong subprotocol, Docker networking, WebSocket upgrade failures.

### Claude's Discretion

- Exact power/energy numeric values for the DC V2G scenario (e.g., maxDischargePower, energy export values)
- EVSE and connector ID numbering in examples
- Ordering and grouping of troubleshooting tips
- Whether to include a brief architecture diagram or keep it text-only
- Message correlation IDs and unique ID format in examples

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OCPP 2.1 WebSocket Configuration

- `Server/src/config/envs/docker.ts` -- Port 8083 WebSocket server config: security profile 0, protocol 'ocpp2.1', allowUnknownChargingStations: true
- `Server/docker-compose.yml` -- Docker Compose service definitions, port mappings (8083 exposed for OCPP 2.1)

### Authentication & Connection Pipeline

- `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` -- WebSocket connection handling, station ID extraction from URL path
- `02_Util/src/networkconnection/authenticator/Authenticator.ts` -- Authentication filter chain (UnknownStationFilter, ConnectedStationFilter, NetworkProfileFilter, BasicAuthenticationFilter)
- `02_Util/src/networkconnection/authenticator/UnknownStationFilter.ts` -- Allows unknown stations when config flag is true

### Existing Connection Documentation

- `Server/everest/README.md` -- EVerest testing guide (OCPP 2.0.1 only, useful as format reference)
- `README.md` -- Main README with architecture overview and Docker setup instructions

### OCPP 2.1 Message Types (for JSON examples)

- `00_Base/src/ocpp/model/2.1/types/` -- All OCPP 2.1 request/response type definitions
- `00_Base/src/ocpp/model/2.1/schemas/` -- JSON schemas defining valid message structures
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- Enum values including EnergyTransferModeEnumType (DC_BPT), ChargingStateEnumType (Discharging)

### Module Handlers (for expected response behavior)

- `03_Modules/Configuration/src/module/BootNotificationService.ts` -- BootNotification response logic
- `03_Modules/Transactions/src/module/module.ts` -- TransactionEvent handler
- `03_Modules/SmartCharging/src/module/module.ts` -- NotifyEVChargingNeeds handler (Phase 2 extended for BPT)
- `03_Modules/EVDriver/src/module/module.ts` -- NotifyAllowedEnergyTransfer stub handler (Phase 2 added)

### Prior Phase Context

- `.planning/phases/02-v2x-module-handlers/02-CONTEXT.md` -- Phase 2 decisions: simple max-power BPT profiles, stub NotifyAllowedEnergyTransfer handler
- `.planning/phases/01-foundation-fixes/01-CONTEXT.md` -- Phase 1 decisions: validator fix, V2X enum additions

### Research

- `.planning/research/SUMMARY.md` -- Gap analysis overview
- `.planning/codebase/INTEGRATIONS.md` -- External integrations and WebSocket connection details

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- EVerest README (`Server/everest/README.md`) -- format reference for a connection guide, though it covers OCPP 2.0.1
- Main README (`README.md`) -- has architecture diagram and Docker setup that can be referenced rather than duplicated

### Established Patterns

- Docker Compose is the standard deployment method with services: amqp-broker, ocpp-db, citrine, minio, graphql-engine
- OCPP 2.1 WebSocket: port 8083, protocol `ocpp2.1`, security profile 0, `allowUnknownChargingStations: true`
- Station ID is extracted from the WebSocket URL path (e.g., `ws://host:8083/CS001`)
- OCPP message framing: `[MessageType, UniqueId, Action, Payload]` for Call, `[MessageType, UniqueId, Payload]` for CallResult

### Integration Points

- `docker compose up -d` from `Server/` directory starts all required services
- Port 8083 is exposed on the citrine container for OCPP 2.1 connections
- No station pre-registration needed (allowUnknownChargingStations: true in default config)
- Healthcheck on port 8080 confirms the server is ready before connecting

</code_context>

<specifics>
## Specific Ideas

- Use commercial V2G DC scenario (~50kW) to exercise the DC_BPT code paths added in Phase 2
- Keep station ID simple ("CS001") since unknown stations are allowed
- Include wscat commands so developer can follow along step by step without custom tooling
- Note that NotifyAllowedEnergyTransfer returns a stub response (Accepted) per Phase 2 decisions

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

_Phase: 03-integration-and-connection-guide_
_Context gathered: 2026-03-26_
