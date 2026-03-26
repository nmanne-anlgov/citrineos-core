<!--
SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project

SPDX-License-Identifier: Apache-2.0
-->

# V2X Discharge Connection Guide -- OCPP 2.1

This guide walks through connecting an OCPP 2.1 charging station client to CitrineOS and executing a V2X (Vehicle-to-Grid) DC discharge session.

The scenario demonstrates a commercial V2G DC discharge flow with ~50kW discharge power using the `DC_BPT` (DC Bidirectional Power Transfer) energy transfer mode. The station ID used throughout is `CS001`, which works out of the box with the default Docker configuration (`allowUnknownChargingStations: true`).

---

## What Works Today (Handler Support Matrix)

Not all OCPP 2.1 message handlers are fully registered for the `ocpp2.1` subprotocol yet. The table below documents the current state:

| Message                     | OCPP 2.1 Handler      | Expected Response           |
| --------------------------- | --------------------- | --------------------------- |
| BootNotification            | Yes (OCPP_2_VER_LIST) | Accepted                    |
| StatusNotification          | Yes (OCPP_2_VER_LIST) | Empty response (OK)         |
| Authorize                   | No (2.0.1 only)       | NotSupported CallError      |
| TransactionEvent            | No (2.0.1 only)       | NotSupported CallError      |
| NotifyEVChargingNeeds       | Yes (OCPP_2_VER_LIST) | Accepted (with BPT profile) |
| NotifyAllowedEnergyTransfer | N/A (CSMS-to-station) | Station receives, not sends |
| MeterValues                 | No (2.0.1 only)       | NotSupported CallError      |

**Why some messages return NotSupported:** The Authorize, TransactionEvent, and MeterValues handlers are registered only for OCPP 2.0.1 (via `@AsHandler([OCPPVersion.OCPP2_0_1], ...)`). When a station connects on the `ocpp2.1` subprotocol and sends these actions, the server returns a `NotSupported` CallError because `AbstractModule.handle()` finds no matching handler for the requested protocol version.

---

## Prerequisites

- **Docker and Docker Compose** installed
- **wscat** installed: `npm install -g wscat` (or use `npx wscat`)
- **CitrineOS repository** cloned and on the `feature/ocpp-2.1` branch
- **No station pre-registration needed** -- the default Docker configuration sets `allowUnknownChargingStations: true`

---

## Starting CitrineOS

Start CitrineOS and all its dependencies using Docker Compose:

```bash
cd Server
docker compose up -d
```

Wait for all services to become healthy:

```bash
docker compose ps
```

Wait until the `citrine` service shows `healthy`. The container has a 60-second start period, and the first startup takes longer due to the build step.

### Service Overview

| Service        | Port(s)     | Purpose                                        |
| -------------- | ----------- | ---------------------------------------------- |
| citrine        | 8080        | HTTP API                                       |
| citrine        | 8083        | OCPP 2.1 WebSocket (security profile 0)        |
| ocpp-db        | 5432        | PostgreSQL database                            |
| amqp-broker    | 5672, 15672 | RabbitMQ message broker (AMQP + management UI) |
| graphql-engine | 8090        | Hasura GraphQL API                             |

---

## Connecting via WebSocket

Connect to the OCPP 2.1 WebSocket server using wscat:

```bash
wscat -c ws://localhost:8083/CS001 -s ocpp2.1
```

- **Port 8083** is the OCPP 2.1 WebSocket server.
- **CS001** is the station ID, extracted from the URL path.
- **`-s ocpp2.1`** sets the `Sec-WebSocket-Protocol` header to `ocpp2.1`.

**Expected result:** A `Connected` prompt appears (`>`). If the connection drops immediately, check the subprotocol flag -- see the [Troubleshooting](#troubleshooting) section.

---

## V2X Discharge Message Sequence

The complete V2X DC discharge session consists of 9 messages. Each step below shows the full OCPP Call (station to CSMS) and the expected CSMS response.

### Step 1: BootNotification (Station -> CSMS) -- WORKS

The station announces itself to the CSMS after powering up.

**Station request (Call):**

```json
[
  2,
  "boot-1",
  "BootNotification",
  {
    "reason": "PowerUp",
    "chargingStation": {
      "model": "V2X-DC-50",
      "vendorName": "TestVendor",
      "serialNumber": "SN-V2X-001"
    }
  }
]
```

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response (CallResult):**

```json
[3, "boot-1", { "currentTime": "2026-03-26T12:00:00.000Z", "interval": 60, "status": "Accepted" }]
```

**Notes:**

- `currentTime` will reflect the actual server time.
- `interval` is the heartbeat interval in seconds (default 60).
- `status` will be `Accepted` because the Docker config sets `unknownChargerStatus: Accepted` and `autoAccept: true`.

---

### Step 2: StatusNotification (Station -> CSMS) -- WORKS

The station reports the status of its connector.

**Station request (Call):**

```json
[
  2,
  "status-1",
  "StatusNotification",
  {
    "timestamp": "2026-03-26T12:00:05.000Z",
    "connectorStatus": "Available",
    "evseId": 1,
    "connectorId": 1
  }
]
```

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response (CallResult -- empty per OCPP 2.1 spec):**

```json
[3, "status-1", {}]
```

**Notes:**

- StatusNotification has an empty response body in OCPP 2.1.

---

### Step 3: Authorize (Station -> CSMS) -- NotSupported

The station requests authorization for a user's ID token. This handler is only registered for OCPP 2.0.1.

**Station request (Call):**

```json
[2, "auth-1", "Authorize", { "idToken": { "idToken": "RFID-001", "type": "ISO14443" } }]
```

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response (CallError):**

```json
[4, "auth-1", "NotSupported", "No handler found for action: Authorize at module evdriver", {}]
```

**Notes:**

- The Authorize handler at `EVDriver/module.ts` uses `@AsHandler([OCPPVersion.OCPP2_0_1], ...)`, so it does not process OCPP 2.1 requests.
- For testing V2X-specific functionality, this step can be skipped. Some stations support `NoAuthorization` mode where authorization is embedded in TransactionEvent.

---

### Step 4: TransactionEvent Started (Station -> CSMS) -- NotSupported

The station reports that a new charging/discharging transaction has started.

**Station request (Call):**

```json
[
  2,
  "tx-started-1",
  "TransactionEvent",
  {
    "eventType": "Started",
    "timestamp": "2026-03-26T12:01:00.000Z",
    "triggerReason": "Authorized",
    "seqNo": 0,
    "transactionInfo": {
      "transactionId": "V2X-TX-001",
      "chargingState": "EVConnected"
    },
    "evse": { "id": 1, "connectorId": 1 },
    "idToken": { "idToken": "RFID-001", "type": "ISO14443" }
  }
]
```

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response (CallError):**

```json
[
  4,
  "tx-started-1",
  "NotSupported",
  "No handler found for action: TransactionEvent at module transactions",
  {}
]
```

**Notes:**

- The TransactionEvent handler is only registered for OCPP 2.0.1. This means no transaction record is created in the database.
- This impacts Step 5 (NotifyEVChargingNeeds) because that handler checks for an active transaction.

---

### Step 5: NotifyEVChargingNeeds (Station -> CSMS) -- WORKS (but depends on Step 4)

The station communicates the EV's charging/discharging needs using DC_BPT parameters. This handler is registered for both OCPP 2.0.1 and 2.1.

**Station request (Call):**

```json
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

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response when a transaction exists (CallResult):**

```json
[3, "needs-1", { "status": "Accepted" }]
```

**Expected CSMS response when NO transaction exists (CallResult):**

```json
[3, "needs-1", { "status": "Rejected" }]
```

**Notes:**

- The handler is registered for OCPP 2.1 and accepts `DC_BPT` mode (implemented in Phase 2).
- It queries for an active transaction on EVSE 1. Since TransactionEvent in Step 4 returned NotSupported, no transaction was created, so this will return `Rejected`.
- This confirms the V2X handler code path works correctly -- it validates BPT parameters and checks for a transaction -- even though the end-to-end flow is blocked by the TransactionEvent gap.
- If a transaction were created (e.g., via the REST API or by using the `ocpp2.0.1` subprotocol on port 8081 for the TransactionEvent step), this would return `Accepted` and trigger a `SetChargingProfile` with `dischargeLimit` set to the negative `maxDischargePower` (-50000).

---

### Step 6: NotifyAllowedEnergyTransfer (CSMS -> Station) -- Cannot be demonstrated via wscat

This is a CSMS-to-station message. The CSMS sends it TO the station to inform which energy transfer modes are allowed. There is currently no automated trigger or REST API endpoint to initiate this message.

**Message format the station client should be prepared to RECEIVE:**

```json
[2, "allowed-energy-1", "NotifyAllowedEnergyTransfer", { "allowedEnergyTransfer": ["DC_BPT"] }]
```

**Expected station response (station sends back to CSMS):**

```json
[3, "allowed-energy-1", { "status": "Accepted" }]
```

**Notes:**

- The Phase 2 stub handler at `EVDriver/module.ts` processes the station's response and logs the status.
- In a full implementation, the CSMS would send this after processing charging needs.
- For now, this step is informational only -- the station client should be ready to receive and respond to this message.

---

### Step 7: MeterValues with discharge data (Station -> CSMS) -- NotSupported

The station reports metering data with discharge/export measurands.

**Station request (Call):**

```json
[
  2,
  "meter-1",
  "MeterValues",
  {
    "evseId": 1,
    "meterValue": [
      {
        "timestamp": "2026-03-26T12:10:00.000Z",
        "sampledValue": [
          {
            "measurand": "Energy.Active.Export.Register",
            "value": 5000,
            "unitOfMeasure": { "unit": "Wh" }
          },
          {
            "measurand": "Power.Active.Export",
            "value": 48500,
            "unitOfMeasure": { "unit": "W" }
          },
          {
            "measurand": "Display.PresentSOC",
            "value": 65,
            "unitOfMeasure": { "unit": "Percent" }
          }
        ]
      }
    ]
  }
]
```

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response (CallError):**

```json
[
  4,
  "meter-1",
  "NotSupported",
  "No handler found for action: MeterValues at module transactions",
  {}
]
```

**Notes:**

- The MeterValues handler is only registered for OCPP 2.0.1.
- Phase 1 added export energy measurand support to `MeterValueUtils` (including `getExportRegisterValuesMap` and bidirectional net energy calculation), but the handler itself has not been extended to OCPP 2.1 yet.

---

### Step 8: TransactionEvent Updated (Station -> CSMS) -- NotSupported

The station reports that the transaction has transitioned to the `Discharging` state.

**Station request (Call):**

```json
[
  2,
  "tx-updated-1",
  "TransactionEvent",
  {
    "eventType": "Updated",
    "timestamp": "2026-03-26T12:15:00.000Z",
    "triggerReason": "ChargingStateChanged",
    "seqNo": 1,
    "transactionInfo": {
      "transactionId": "V2X-TX-001",
      "chargingState": "Discharging"
    },
    "evse": { "id": 1, "connectorId": 1 },
    "meterValue": [
      {
        "timestamp": "2026-03-26T12:15:00.000Z",
        "sampledValue": [
          {
            "measurand": "Energy.Active.Export.Register",
            "value": 8000,
            "unitOfMeasure": { "unit": "Wh" }
          }
        ]
      }
    ]
  }
]
```

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response (CallError):**

```json
[
  4,
  "tx-updated-1",
  "NotSupported",
  "No handler found for action: TransactionEvent at module transactions",
  {}
]
```

**Notes:**

- The `Discharging` chargingState value was added to the DTO enums in Phase 1. The JSON schema validates it correctly.
- However, the TransactionEvent handler itself only supports OCPP 2.0.1.

---

### Step 9: TransactionEvent Ended (Station -> CSMS) -- NotSupported

The station reports that the discharge session has ended.

**Station request (Call):**

```json
[
  2,
  "tx-ended-1",
  "TransactionEvent",
  {
    "eventType": "Ended",
    "timestamp": "2026-03-26T12:30:00.000Z",
    "triggerReason": "EVDeparted",
    "seqNo": 2,
    "transactionInfo": {
      "transactionId": "V2X-TX-001",
      "chargingState": "Idle"
    },
    "evse": { "id": 1, "connectorId": 1 },
    "meterValue": [
      {
        "timestamp": "2026-03-26T12:30:00.000Z",
        "sampledValue": [
          {
            "measurand": "Energy.Active.Export.Register",
            "value": 10000,
            "unitOfMeasure": { "unit": "Wh" }
          }
        ]
      }
    ]
  }
]
```

**wscat:** Paste the JSON above after the `>` prompt.

**Expected CSMS response (CallError):**

```json
[
  4,
  "tx-ended-1",
  "NotSupported",
  "No handler found for action: TransactionEvent at module transactions",
  {}
]
```

---

## Summary of V2X Capabilities Implemented

### What Phases 1-2 Delivered

- **OCPPValidator** correctly validates OCPP 2.1 requests against request schemas (not response schemas)
- **ChargingState "Discharging"** accepted in DTO validation and JSON schemas
- **V2X measurands** (Energy.Active.Export.\*, Display.\*, Setpoint.\*) pass validation
- **MeterValueUtils** computes bidirectional net energy (import - export)
- **NotifyEVChargingNeeds** accepts `DC_BPT` mode with V2X charging parameters
- **Profile calculator** generates discharge-aware ChargingProfiles with `dischargeLimit`
- **ChargingProfile mapper** preserves OCPP 2.1 fields through persistence
- **NotifyAllowedEnergyTransfer** routed to EVDriver in all config environments

### Known Gaps for Future Work

- **Authorize, TransactionEvent, and MeterValues** handlers need OCPP 2.1 registration (extend `@AsHandler` to use `OCPP_2_VER_LIST`)
- **NotifyAllowedEnergyTransfer** needs a MessageApi endpoint to trigger sending from CSMS to station
- **Full end-to-end flow** requires extending the above handlers to `OCPP_2_VER_LIST`

---

## Troubleshooting

### 1. Connection drops immediately after WebSocket upgrade

**Cause:** Wrong subprotocol. Port 8083 requires `ocpp2.1`.

**Fix:** Use the `-s ocpp2.1` flag:

```bash
wscat -c ws://localhost:8083/CS001 -s ocpp2.1
```

### 2. Connection refused on port 8083

**Cause:** CitrineOS container not ready. The container has a 60-second start period.

**Fix:** Run `docker compose ps` and wait until `citrine` shows `healthy`. The first startup takes longer due to the build step.

### 3. "Unknown identifier" authentication error

**Cause:** Missing station ID in URL path.

**Fix:** Include the station ID in the URL:

```bash
# Correct
wscat -c ws://localhost:8083/CS001 -s ocpp2.1

# Wrong -- missing station ID
wscat -c ws://localhost:8083/ -s ocpp2.1
wscat -c ws://localhost:8083 -s ocpp2.1
```

### 4. NotifyEVChargingNeeds returns "Rejected"

**Cause:** No active transaction exists on the EVSE. The handler queries for a transaction record.

**Fix:** This is expected when TransactionEvent returns NotSupported (no transaction created). To test the BPT profile calculation, you can:

- Create a transaction via the REST API (`POST` to `http://localhost:8080/data/transaction`)
- Connect using the `ocpp2.0.1` subprotocol on port 8081 for the TransactionEvent step, then switch to port 8083 for NotifyEVChargingNeeds

### 5. "NotSupported" CallError for Authorize/TransactionEvent/MeterValues

**Cause:** These handlers are only registered for OCPP 2.0.1, not 2.1.

**Fix:** This is the current state of the implementation. These handlers need to be extended with `OCPP_2_VER_LIST` registration. See the [Summary of V2X Capabilities Implemented](#summary-of-v2x-capabilities-implemented) section for the full status.

---

## OCPP Message Framing Reference

OCPP messages use a JSON array format with a message type identifier:

| Type       | Format                                                   | Direction       |
| ---------- | -------------------------------------------------------- | --------------- |
| Call       | `[2, "uniqueId", "Action", {payload}]`                   | Station -> CSMS |
| CallResult | `[3, "uniqueId", {payload}]`                             | CSMS -> Station |
| CallError  | `[4, "uniqueId", "errorCode", "description", {details}]` | CSMS -> Station |

Where `MessageTypeId`: Call = 2, CallResult = 3, CallError = 4.
