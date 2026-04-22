# CitrineOS BPT Console

Lightweight React UI for testing OCPP 2.1 Bidirectional Power Transfer with CitrineOS.

## Features

- Station selector (auto-defaults to first online station, refreshes every 3 s)
- Start Transaction modal with sane defaults (`DEADBEEF` / `Central` / `evseId=1`)
- Stop Transaction button
- BPT setpoint slider: -maxDischargePower..+maxChargePower
  - First slider use: sends `SetChargingProfile` with `operationMode: CentralSetpoint` to establish a dynamic-capable profile
  - Subsequent changes: debounced `UpdateDynamicSchedule` (300 ms)

## Run

```
cd tools/citrineos-ui
npm install
npm run dev
```

Opens at http://localhost:5173. The Vite dev server proxies:

- `/ocpp/*` and `/data/*` → CitrineOS REST API (default `localhost:8080`)
- `/v1/*` → Hasura GraphQL (default `localhost:8090`)

Override targets:

```
VITE_CITRINE_HOST=otherhost VITE_CITRINE_API_PORT=8080 VITE_CITRINE_GQL_PORT=8090 npm run dev
```
