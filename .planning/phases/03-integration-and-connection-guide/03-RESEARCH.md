# Phase 3: Integration and Connection Guide - Research

**Researched:** 2026-03-26
**Domain:** OCPP 2.1 V2X discharge documentation / connection guide
**Confidence:** HIGH

## Summary

This phase produces documentation only -- a standalone markdown guide at `docs/v2x-discharge-guide.md` that explains how to connect an OCPP 2.1 charging station client to CitrineOS via Docker and execute a V2X discharge session. No code changes are required.

The research focused on three areas: (1) understanding the exact WebSocket connection mechanics (URL path, subprotocol negotiation, authentication chain), (2) mapping which V2X flow messages are actually handled by the current codebase (several critical gaps exist), and (3) gathering the JSON schema structures for accurate copy-paste message examples. The most important finding is that while BootNotification, StatusNotification, and NotifyEVChargingNeeds handle OCPP 2.1, three critical messages -- Authorize, TransactionEvent, and MeterValues -- only have handlers registered for OCPP 2.0.1, not 2.1. The guide must document this honestly and provide expected CSMS responses (including `NotSupported` errors) for each step.

**Primary recommendation:** Create the guide with a clear separation between "messages that get a successful CSMS response" and "messages that will receive a NotSupported CallError due to missing 2.1 handlers," so the developer knows exactly what to expect at each step and can validate the V2X-specific handlers (SmartCharging BPT profile calculation, NotifyAllowedEnergyTransfer stub) that were implemented in Phases 1-2.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Create a standalone markdown file at `docs/v2x-discharge-guide.md`. No existing `docs/` directory -- create it.
- **D-02:** Docker-only setup instructions. No local development path. The project constraint is Docker-based deployment.
- **D-03:** Full JSON request/response examples for every message in the sequence. Developer can copy-paste into their client.
- **D-04:** Include the complete flow: BootNotification -> StatusNotification -> Authorize -> TransactionEvent (Started) -> NotifyEVChargingNeeds -> NotifyAllowedEnergyTransfer -> MeterValues (discharge) -> TransactionEvent (Updated) -> TransactionEvent (Ended).
- **D-05:** Document both directions -- station request AND expected CitrineOS response for each step.
- **D-06:** Commercial V2G DC scenario: ~50kW DC discharge, larger energy values. Exercises DC_BPT energy transfer mode code paths from Phase 2.
- **D-07:** Generic station ID convention (e.g., "CS001"). Works with the default Docker config's `allowUnknownChargingStations: true`.
- **D-08:** Include copy-paste `wscat` commands for each message step. Lightweight, no custom tooling needed.
- **D-09:** Include a brief troubleshooting section (3-5 common issues) covering wrong subprotocol, Docker networking, WebSocket upgrade failures.

### Claude's Discretion

- Exact power/energy numeric values for the DC V2G scenario (e.g., maxDischargePower, energy export values)
- EVSE and connector ID numbering in examples
- Ordering and grouping of troubleshooting tips
- Whether to include a brief architecture diagram or keep it text-only
- Message correlation IDs and unique ID format in examples

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                                             | Research Support                                                                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GUIDE-01 | Documentation explains how to connect an OCPP 2.1 charging station client to CitrineOS (WebSocket URL, subprotocol, auth, Docker setup) | WebSocket config verified (port 8083, protocol `ocpp2.1`, security profile 0, allowUnknownChargingStations: true); URL path pattern confirmed (`ws://host:8083/{stationId}`); OCPP message framing documented; all JSON schemas inspected for accurate examples; handler version support gaps identified |

</phase_requirements>

## Standard Stack

This phase produces documentation only -- no libraries are installed or code written.

### Tools Referenced in Guide

| Tool                    | Purpose                                        | Install                |
| ----------------------- | ---------------------------------------------- | ---------------------- |
| Docker + Docker Compose | Run CitrineOS and its dependencies             | Pre-requisite          |
| wscat                   | WebSocket CLI client for sending OCPP messages | `npm install -g wscat` |

No version verification needed -- this is a documentation-only phase.

## Architecture Patterns

### WebSocket Connection Mechanics (confirmed by code inspection)

**URL Pattern:** `ws://localhost:8083/{stationId}`

- Port 8083 is the OCPP 2.1 WebSocket server (configured in `docker.ts` server ID `4`)
- Station ID is extracted from the last path segment of the URL (`Authenticator._getClientIdFromUrl()` at `02_Util/src/networkconnection/authenticator/Authenticator.ts:54-56`)
- Example: `ws://localhost:8083/CS001` registers station with ID `CS001`

**Subprotocol Negotiation:**

- Server expects the `Sec-WebSocket-Protocol` header to contain `ocpp2.1`
- `WebsocketNetworkConnection._handleProtocols()` checks if the client's proposed protocols include the server's configured protocol
- If the subprotocol doesn't match, the connection is rejected

**Authentication Chain (security profile 0):**

1. `UnknownStationFilter` -- skipped when `allowUnknownChargingStations: true` (default Docker config)
2. `ConnectedStationFilter` -- checks if station is already connected
3. `NetworkProfileFilter` -- validates network profile
4. `BasicAuthenticationFilter` -- skipped for security profile 0 (no auth required)

**Tenant Resolution:**

- Default tenant ID is used when `dynamicTenantResolution` is enabled but no tenant is specified in the request
- `DEFAULT_TENANT_ID` is the fallback (imported from `@citrineos/base`)

### OCPP Message Framing (confirmed from `00_Base/src/ocpp/rpc/message.ts`)

```
Call (station -> CSMS):       [2, "uniqueId", "Action", {payload}]
CallResult (CSMS -> station): [3, "uniqueId", {payload}]
CallError (CSMS -> station):  [4, "uniqueId", "errorCode", "description", {details}]
```

- `MessageTypeId.Call = 2` -- request from station
- `MessageTypeId.CallResult = 3` -- successful response
- `MessageTypeId.CallError = 4` -- error response

### Handler Version Support Matrix (CRITICAL for guide accuracy)

This is the most important research finding. Each handler is registered for specific OCPP versions via `@AsHandler()` decorator. Messages from an OCPP 2.1 station that hit a handler only registered for `[OCPPVersion.OCPP2_0_1]` will receive a `NotSupported` CallError.

| Message                     | Handler Versions                        | OCPP 2.1 Result                    | Source                      |
| --------------------------- | --------------------------------------- | ---------------------------------- | --------------------------- |
| BootNotification            | `OCPP_2_VER_LIST` (2.0.1 + 2.1)         | **Accepted**                       | Configuration/module.ts:230 |
| StatusNotification          | `OCPP_2_VER_LIST` (2.0.1 + 2.1)         | **Accepted** (empty response)      | Transactions/module.ts:504  |
| Authorize                   | `[OCPPVersion.OCPP2_0_1]` only          | **NotSupported CallError**         | EVDriver/module.ts:276      |
| TransactionEvent            | `[OCPPVersion.OCPP2_0_1]` only          | **NotSupported CallError**         | Transactions/module.ts:283  |
| NotifyEVChargingNeeds       | `OCPP_2_VER_LIST` (2.0.1 + 2.1)         | **Accepted** (Phase 2 BPT support) | SmartCharging/module.ts     |
| MeterValues                 | `[OCPPVersion.OCPP2_0_1]` only          | **NotSupported CallError**         | Transactions/module.ts:431  |
| NotifyAllowedEnergyTransfer | CSMS-to-station (response handler only) | N/A (station receives, not sends)  | EVDriver/module.ts:772      |

**Impact on guide:** The guide must document that 3 of the 9 messages in the V2X flow will receive NotSupported errors because their handlers have not yet been extended to OCPP 2.1. This is an honest representation of the current implementation state. The guide demonstrates the V2X-specific functionality that WAS implemented (BPT profile calculation, V2X enum support) while documenting known gaps.

### Docker Compose Services (from `Server/docker-compose.yml`)

| Service        | Image                         | Ports                                                | Purpose                    |
| -------------- | ----------------------------- | ---------------------------------------------------- | -------------------------- |
| amqp-broker    | rabbitmq:3-management         | 5672, 15672                                          | Message broker             |
| ocpp-db        | postgis/postgis:16-3.5        | 5432                                                 | Database                   |
| citrine        | Built from Dockerfile         | 8080, 8081-8083, 8443, 8444, 8092, 9229, 10000-10500 | CitrineOS server           |
| minio          | minio/minio                   | 9000, 9001                                           | S3-compatible file storage |
| minio-init     | minio/mc                      | --                                                   | Initialize MinIO           |
| graphql-engine | hasura/graphql-engine:v2.40.3 | 8090                                                 | GraphQL API                |

**Startup order:**

1. `ocpp-db` and `amqp-broker` start first (healthchecks)
2. `minio` starts, then `minio-init` runs
3. `citrine` starts after `ocpp-db`, `amqp-broker` healthy AND `minio-init` completes
4. `graphql-engine` starts after `citrine` is healthy

**Healthcheck for citrine:** TCP connection check on port 8080 (30s interval, 60s start period, 5 retries)

### BootNotification Default Behavior

The `BootNotificationService.determineBootStatus()` method controls the response:

- For unknown stations (no Boot config in DB): uses `unknownChargerStatus` from system config
- Docker config sets `ocpp2_0_1.unknownChargerStatus: Accepted` and `autoAccept: true`
- Result: A new station connecting for the first time will get `status: "Accepted"` immediately
- Response includes `currentTime` (ISO 8601), `interval` (heartbeat interval, defaults from config), and `status`

### NotifyEVChargingNeeds V2X Flow (Phase 2 implementation)

After receiving NotifyEVChargingNeeds with `requestedEnergyTransfer: "DC_BPT"` and `v2xChargingParameters`:

1. Handler validates that `v2xChargingParameters != null` when BPT mode is requested
2. Looks up active transaction on the specified EVSE
3. Calls `calculateChargingProfile()` which generates a simple max-power BPT profile
4. Responds with `status: "Accepted"`
5. Sends `SetChargingProfile` call to the station with the calculated profile
6. Does NOT automatically send `NotifyAllowedEnergyTransfer`

### NotifyAllowedEnergyTransfer (CSMS-to-station direction)

This is a CSMS-initiated message, not a station-initiated one. The CSMS sends it TO the station to inform which energy transfer modes are allowed. The station sends back a response (Accepted/Rejected).

- The Phase 2 stub handler at `EVDriver/module.ts:772` handles the station's RESPONSE
- There is NO code that automatically triggers SENDING this message to the station
- There is NO MessageApi endpoint (no `03_Modules/EVDriver/src/module/2.1/` directory exists)
- For the guide: this step cannot be demonstrated end-to-end via wscat because the station cannot initiate it

### V2X Charging Parameters Structure (for guide examples)

Key V2XChargingParametersType fields for a ~50kW DC BPT scenario:

- `minChargePower` (W) -- e.g., 1000 (1kW minimum)
- `maxChargePower` (W) -- e.g., 50000 (50kW)
- `minDischargePower` (W) -- e.g., 1000 (1kW minimum)
- `maxDischargePower` (W) -- e.g., 50000 (50kW) -- **this is used by Phase 2 profile calculator**
- `minChargeCurrent` (A) -- e.g., 2
- `maxChargeCurrent` (A) -- e.g., 125
- `minDischargeCurrent` (A) -- e.g., 2
- `maxDischargeCurrent` (A) -- e.g., 125
- `minVoltage` (V) -- e.g., 200
- `maxVoltage` (V) -- e.g., 500
- `evTargetEnergyRequest` (Wh) -- e.g., -10000 (requesting 10kWh discharge)
- `evMinV2XEnergyRequest` (Wh) -- can be negative
- `evMaxV2XEnergyRequest` (Wh) -- can be negative
- `targetSoC` (0-100) -- e.g., 30

### OCPP 2.1 EnergyTransferModeEnumType Values

From schema: `AC_single_phase`, `AC_two_phase`, `AC_three_phase`, `DC`, `AC_BPT`, `AC_BPT_DER`, `AC_DER`, `DC_BPT`, `DC_ACDP`, `DC_ACDP_BPT`, `WPT`

For the guide: use `DC_BPT` (DC Bidirectional Power Transfer) per decision D-06.

### TransactionEvent Type Structure

Required fields: `eventType`, `timestamp`, `triggerReason`, `seqNo`, `transactionInfo`

- `eventType`: `Started`, `Updated`, `Ended`
- `triggerReason`: various including `Authorized`, `ChargingStateChanged`, `EVDeparted`, `StopAuthorized`, `MeterValuePeriodic`, `OperationModeChanged`
- `transactionInfo.transactionId`: string, max 36 chars
- `transactionInfo.chargingState`: includes `Discharging` (Phase 1 added this to DTO enums)
- `transactionInfo.operationMode`: `Idle`, `ChargingOnly`, `CentralSetpoint`, `ExternalSetpoint` (OCPP 2.1 only)

### MeterValues V2X Measurands

Key V2X-relevant measurands (from `MeasurandEnumType`):

- `Energy.Active.Export.Register` -- cumulative discharged energy (Wh)
- `Energy.Active.Export.Interval` -- discharged energy in interval (Wh)
- `Power.Active.Export` -- current discharge power (W)
- `Display.PresentSOC` -- current battery state of charge (%)
- `SoC` -- state of charge

### Anti-Patterns to Avoid

- **Duplicating main README setup instructions:** Reference the main README for general Docker setup, don't copy
- **Omitting expected errors:** If a handler returns NotSupported, document it honestly -- don't pretend the flow works end-to-end
- **Using OCPP 2.0.1 subprotocol:** Must use `ocpp2.1` to exercise the V2X code paths added in Phases 1-2
- **Complex station IDs:** Keep it simple (CS001) to avoid URL encoding issues

## Don't Hand-Roll

| Problem                         | Don't Build           | Use Instead                                      | Why                                                          |
| ------------------------------- | --------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| WebSocket client                | Custom Node.js script | wscat                                            | Zero setup, copy-paste commands, widely available            |
| UUID generation for message IDs | Random strings        | Descriptive format like "boot-1", "tx-started-1" | Readability in guide examples; wscat doesn't need real UUIDs |
| Docker orchestration            | Custom scripts        | `docker compose up -d` from Server/              | Standard project approach                                    |

## Common Pitfalls

### Pitfall 1: Wrong WebSocket Subprotocol

**What goes wrong:** Station connects but gets immediately disconnected
**Why it happens:** `WebsocketNetworkConnection._handleProtocols()` checks that the client's proposed subprotocol matches the server's configured protocol. Port 8083 requires `ocpp2.1`.
**How to avoid:** Use `wscat -c ws://localhost:8083/CS001 -s ocpp2.1`
**Warning signs:** WebSocket connection closes immediately after upgrade; server logs show protocol mismatch

### Pitfall 2: Docker Container Not Ready

**What goes wrong:** WebSocket connection refused or timeout
**Why it happens:** The `citrine` container has a 60s start period. The build step in Docker Compose (`build: context: ../`) means first start requires compilation.
**How to avoid:** Wait for `docker compose ps` to show `citrine` as `healthy` before connecting. Healthcheck pings port 8080.
**Warning signs:** `Connection refused` on port 8083; `citrine` container status shows `starting` or `unhealthy`

### Pitfall 3: Forgetting Station ID in URL Path

**What goes wrong:** Connection fails or station identified incorrectly
**Why it happens:** The station ID is extracted from the last segment of the URL path (`url.split('/').pop()`). An empty path or missing station ID produces an invalid identifier.
**How to avoid:** Always include station ID: `ws://localhost:8083/CS001`, not `ws://localhost:8083/` or `ws://localhost:8083`
**Warning signs:** Authentication fails with "Unknown identifier" error

### Pitfall 4: NotifyEVChargingNeeds Rejected Due to No Active Transaction

**What goes wrong:** NotifyEVChargingNeeds returns `Rejected` instead of `Accepted`
**Why it happens:** The handler queries for an active transaction on the specified EVSE. If TransactionEvent(Started) was never processed (due to NotSupported error for OCPP 2.1), there is no active transaction.
**How to avoid:** Document this as an expected limitation -- the SmartCharging handler validates correctly but depends on TransactionEvent which lacks a 2.1 handler. A workaround would be to create a transaction via the REST API or switch to OCPP 2.0.1 subprotocol for TransactionEvent.
**Warning signs:** NotifyEVChargingNeeds response has `status: "Rejected"`

### Pitfall 5: Expecting NotifyAllowedEnergyTransfer from the Station Side

**What goes wrong:** Developer tries to send NotifyAllowedEnergyTransfer as a Call from the station
**Why it happens:** NotifyAllowedEnergyTransfer is a CSMS-to-station message, not station-to-CSMS. In OCPP 2.1, the CSMS sends this message TO the station.
**How to avoid:** Document the directionality clearly. The station RECEIVES this message and responds. There is currently no API endpoint or automated trigger to send it.
**Warning signs:** CSMS returns FormatViolation or NotSupported if station tries to send it as a request

## Code Examples

### wscat Connection Command

```bash
# Source: Server/src/config/envs/docker.ts, port 8083 config
wscat -c ws://localhost:8083/CS001 -s ocpp2.1
```

### OCPP Call Frame (station to CSMS)

```json
// Source: 00_Base/src/ocpp/rpc/message.ts, Call type definition
[
  2,
  "unique-msg-id",
  "BootNotification",
  { "reason": "PowerUp", "chargingStation": { "model": "V2X-DC-50", "vendorName": "TestVendor" } }
]
```

### OCPP CallResult Frame (CSMS to station)

```json
// Source: 00_Base/src/ocpp/rpc/message.ts, CallResult type definition
[
  3,
  "unique-msg-id",
  { "currentTime": "2026-03-26T10:00:00.000Z", "interval": 60, "status": "Accepted" }
]
```

### OCPP CallError Frame (CSMS to station -- for unsupported 2.1 messages)

```json
// Source: 00_Base/src/interfaces/modules/AbstractModule.ts:179-182
[
  4,
  "unique-msg-id",
  "NotSupported",
  "No handler found for action: Authorize at module evdriver",
  {}
]
```

### NotifyEVChargingNeeds with DC_BPT V2X Parameters

```json
// Source: 00_Base/src/ocpp/model/2.1/schemas/NotifyEVChargingNeedsRequest.json
[
  2,
  "needs-1",
  "NotifyEVChargingNeeds",
  {
    "evseId": 1,
    "chargingNeeds": {
      "requestedEnergyTransfer": "DC_BPT",
      "v2xChargingParameters": {
        "minChargePower": 1000,
        "maxChargePower": 50000,
        "minDischargePower": 1000,
        "maxDischargePower": 50000,
        "minChargeCurrent": 2,
        "maxChargeCurrent": 125,
        "minDischargeCurrent": 2,
        "maxDischargeCurrent": 125,
        "minVoltage": 200,
        "maxVoltage": 500,
        "evTargetEnergyRequest": -10000,
        "targetSoC": 30
      }
    }
  }
]
```

## State of the Art

| Old Approach                                      | Current Approach                                          | When Changed         | Impact                                               |
| ------------------------------------------------- | --------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| OCPP 2.0.1 handler-only registration              | Phase 2 added `OCPP_2_VER_LIST` to SmartCharging handlers | Phase 2 (2026-03-26) | NotifyEVChargingNeeds now accepts BPT modes for 2.1  |
| No V2X enum values in DTOs                        | Phase 1 added Discharging state and V2X measurands        | Phase 1 (2026-03-26) | Schema validation no longer rejects V2X payloads     |
| OCPPValidator bug (wrong schema for 2.1 requests) | Fixed in Phase 1                                          | Phase 1 (2026-03-26) | OCPP 2.1 request validation now uses correct schemas |

**Still using old approach (known gaps):**

- Authorize: still OCPP 2.0.1 only -- 2.1 stations get NotSupported
- TransactionEvent: still OCPP 2.0.1 only -- 2.1 stations get NotSupported
- MeterValues: still OCPP 2.0.1 only -- 2.1 stations get NotSupported

## Open Questions

1. **Authorize handler gap workaround**

   - What we know: Authorize handler only supports OCPP 2.0.1. A 2.1 station sending Authorize will get NotSupported.
   - What's unclear: Whether to skip Authorize in the guide flow (some stations use NoAuthorization idToken type in TransactionEvent directly), or document the error as expected behavior.
   - Recommendation: Document both the error AND the workaround. The guide can note that authorization can be embedded in TransactionEvent via `idToken` field, or that the developer can omit the Authorize step if their client supports it. However, since TransactionEvent itself also returns NotSupported for 2.1, this is a compound gap.

2. **TransactionEvent gap impact on NotifyEVChargingNeeds**

   - What we know: NotifyEVChargingNeeds checks for an active transaction on the EVSE. Without a successful TransactionEvent(Started), there is no active transaction.
   - What's unclear: Whether the guide should show the full ideal flow (with expected errors) or only the messages that actually work.
   - Recommendation: Show the complete flow per decision D-04, but clearly annotate each step with the expected CSMS response (success or error). Include a "What Works Today" summary at the top.

3. **NotifyAllowedEnergyTransfer demonstration**
   - What we know: This is CSMS-to-station. No code triggers sending it. No REST API endpoint exists.
   - What's unclear: How to demonstrate this in the guide.
   - Recommendation: Document the message format and note that this is a CSMS-initiated message. The developer's station client would need to be prepared to RECEIVE this message, not send it.

## Environment Availability

| Dependency | Required By           | Available | Version | Fallback                                          |
| ---------- | --------------------- | --------- | ------- | ------------------------------------------------- |
| Docker     | Running CitrineOS     | Yes       | 29.3.1  | --                                                |
| wscat      | Sending OCPP messages | No        | --      | `npx wscat` or install via `npm install -g wscat` |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:**

- wscat: Not globally installed but can be run via `npx wscat` or installed per guide instructions

## Sources

### Primary (HIGH confidence)

- `Server/src/config/envs/docker.ts` -- WebSocket server config (port 8083, protocol `ocpp2.1`, allowUnknownChargingStations: true)
- `Server/docker-compose.yml` -- Docker services, port mappings, healthchecks, startup order
- `02_Util/src/networkconnection/WebsocketNetworkConnection.ts` -- Connection handling, station ID extraction, protocol negotiation
- `02_Util/src/networkconnection/authenticator/Authenticator.ts` -- Authentication chain, station ID from URL path
- `02_Util/src/networkconnection/authenticator/UnknownStationFilter.ts` -- allowUnknownChargingStations bypass
- `00_Base/src/ocpp/rpc/message.ts` -- MessageTypeId enum (Call=2, CallResult=3, CallError=4), OCPP_2_VER_LIST
- `00_Base/src/ocpp/model/2.1/schemas/*.json` -- All V2X message JSON schemas (BootNotification, StatusNotification, Authorize, TransactionEvent, NotifyEVChargingNeeds, NotifyAllowedEnergyTransfer, MeterValues)
- `00_Base/src/ocpp/model/2.1/enums/index.ts` -- EnergyTransferModeEnumType (DC_BPT), ChargingStateEnumType (Discharging), OperationModeEnumType
- `03_Modules/Configuration/src/module/module.ts` -- BootNotification handler (`OCPP_2_VER_LIST`), unknownChargerStatus logic
- `03_Modules/Configuration/src/module/BootNotificationService.ts` -- Boot response generation logic
- `03_Modules/Transactions/src/module/module.ts` -- TransactionEvent (2.0.1 only), StatusNotification (OCPP_2_VER_LIST), MeterValues (2.0.1 only)
- `03_Modules/SmartCharging/src/module/module.ts` -- NotifyEVChargingNeeds handler with Phase 2 BPT extensions
- `03_Modules/EVDriver/src/module/module.ts` -- Authorize (2.0.1 only), NotifyAllowedEnergyTransfer response handler (2.1)
- `00_Base/src/interfaces/modules/AbstractModule.ts` -- Handler dispatch and NotSupported error generation (line 179-182)
- `Server/everest/README.md` -- Format reference for connection guide documentation

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` -- Gap analysis confirming handler version gaps
- `.planning/phases/01-foundation-fixes/01-CONTEXT.md` -- Phase 1 scope (validator fix, enum additions)
- `.planning/phases/02-v2x-module-handlers/02-CONTEXT.md` -- Phase 2 scope (BPT profile calc, NotifyAllowedEnergyTransfer stub)

## Metadata

**Confidence breakdown:**

- WebSocket connection mechanics: HIGH -- directly inspected all relevant source files
- Handler version support matrix: HIGH -- confirmed by `@AsHandler` decorator arguments in each module
- OCPP message structure: HIGH -- derived from JSON schemas in `00_Base/src/ocpp/model/2.1/schemas/`
- Docker setup: HIGH -- docker-compose.yml directly inspected
- V2X flow completeness: HIGH -- cross-referenced schemas, handler registrations, and Phase 1-2 implementation commits

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- documentation phase, no external dependency changes expected)
