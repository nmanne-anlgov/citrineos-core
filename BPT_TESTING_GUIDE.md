# CitrineOS BPT Testing Guide

## Setup

1. Start CitrineOS: `docker compose up` from `Server/`
2. Connect charger on port **8081** (ocpp2.0.1) or **8083** (ocpp2.1)
3. All CSMS commands go to: `http://localhost:8080`

## Flow

### 1. Charger connects and starts session (automatic)

The charger handles this side. Watch the logs for:

```
BootNotification received
StatusNotification received       <- connector goes Available
Authorize received                <- RFID tap
Transaction event received        <- session starts
NotifyEVChargingNeeds received    <- charger announces DC_BPT
Charging profile created          <- CitrineOS auto-sends SetChargingProfile
```

At this point the charger is **charging** using the auto-generated profile.

Copy the `transactionId` from the logs -- you need it for every command below.

### 2. Switch to discharge (-15A)

```bash
curl -X POST \
  'http://localhost:8080/ocpp/2.1/setChargingProfile?identifier=CP001&tenantId=1' \
  -H 'Content-Type: application/json' \
  -d '{
  "evseId": 1,
  "chargingProfile": {
    "id": 101,
    "stackLevel": 1,
    "chargingProfilePurpose": "TxProfile",
    "chargingProfileKind": "Absolute",
    "transactionId": "PASTE_TRANSACTION_ID_HERE",
    "validFrom": "2026-04-14T00:00:00Z",
    "chargingSchedule": [{
      "id": 2,
      "chargingRateUnit": "A",
      "chargingSchedulePeriod": [{
        "startPeriod": 0,
        "limit": 30.0,
        "setpoint": -15.0,
        "dischargeLimit": -30.0,
        "operationMode": "CentralSetpoint"
      }]
    }]
  }
}'
```

Expect: `{"success": true}` and charger responds `Accepted`.

### 3. Switch back to charge (+20A)

```bash
curl -X POST \
  'http://localhost:8080/ocpp/2.1/setChargingProfile?identifier=CP001&tenantId=1' \
  -H 'Content-Type: application/json' \
  -d '{
  "evseId": 1,
  "chargingProfile": {
    "id": 102,
    "stackLevel": 2,
    "chargingProfilePurpose": "TxProfile",
    "chargingProfileKind": "Absolute",
    "transactionId": "PASTE_TRANSACTION_ID_HERE",
    "validFrom": "2026-04-14T00:00:00Z",
    "chargingSchedule": [{
      "id": 3,
      "chargingRateUnit": "A",
      "chargingSchedulePeriod": [{
        "startPeriod": 0,
        "limit": 30.0,
        "setpoint": 20.0,
        "operationMode": "CentralSetpoint"
      }]
    }]
  }
}'
```

### 4. Stop the session

```bash
curl -X POST \
  'http://localhost:8080/ocpp/2.1/requestStopTransaction?identifier=CP001&tenantId=1' \
  -H 'Content-Type: application/json' \
  -d '{
  "transactionId": "PASTE_TRANSACTION_ID_HERE"
}'
```

## Quick Reference

| Field                              | Meaning                                           |
| ---------------------------------- | ------------------------------------------------- |
| `setpoint: 20.0`                   | Charge at 20A                                     |
| `setpoint: -15.0`                  | Discharge at 15A                                  |
| `limit: 30.0`                      | Max charge rate (always positive)                 |
| `dischargeLimit: -30.0`            | Max discharge rate (always negative)              |
| `operationMode: "CentralSetpoint"` | CSMS controls power via setpoint                  |
| `stackLevel`                       | Must be unique per profile -- increment each time |
| `id`                               | Must be unique per profile -- increment each time |

## Rules

- Replace `CP001` with your charger's station ID
- Replace `PASTE_TRANSACTION_ID_HERE` with the actual UUID from logs
- Increment `stackLevel` and `id` on every new profile (duplicates are rejected)
- Set `validFrom` to a **past** timestamp (future values are rejected)
- Positive setpoint = grid to EV (charge)
- Negative setpoint = EV to grid (discharge)

## What to verify in logs

| During charge                   | During discharge                |
| ------------------------------- | ------------------------------- |
| `Current.Import`                | `Current.Export`                |
| `Power.Active.Import`           | `Power.Active.Export`           |
| `Energy.Active.Import.Register` | `Energy.Active.Export.Register` |
