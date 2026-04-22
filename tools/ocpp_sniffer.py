#!/usr/bin/env python3
"""OCPP WebSocket proxy that logs all messages between charger and CSMS."""

import asyncio
import json
import sys
from datetime import datetime, timezone

try:
    import websockets
except ImportError:
    print("pip install websockets")
    sys.exit(1)

LISTEN_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9100
CSMS_URL = sys.argv[2] if len(sys.argv) > 2 else "ws://localhost:8083"
LOG_FILE = sys.argv[3] if len(sys.argv) > 3 else "/tmp/ocpp_traffic.log"

OCPP_TYPES = {2: "CALL", 3: "CALLRESULT", 4: "CALLERROR"}


def fmt(raw: str) -> str:
    try:
        msg = json.loads(raw)
        kind = OCPP_TYPES.get(msg[0], str(msg[0]))
        if msg[0] == 2:
            return f"{kind} {msg[2]} id={msg[1]}\n  {json.dumps(msg[3], indent=2)}"
        elif msg[0] == 3:
            return f"{kind} id={msg[1]}\n  {json.dumps(msg[2], indent=2)}"
        elif msg[0] == 4:
            return f"{kind} id={msg[1]} code={msg[2]} msg={msg[3]}"
    except Exception:
        pass
    return raw


def log(direction: str, raw: str, f):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]
    entry = f"[{ts}] {direction}\n{fmt(raw)}\n"
    print(entry)
    f.write(entry + "\n")
    f.flush()


async def proxy(ws):
    path = ws.request.path if hasattr(ws, 'request') else ""
    subprotocols = ws.subprotocol or "ocpp2.1"
    station_id = path.strip("/").split("/")[-1] if path else "unknown"
    target = f"{CSMS_URL}/{station_id}"

    print(f"[connect] {station_id} -> {target} (subprotocol: {subprotocols})")

    with open(LOG_FILE, "a") as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"Session: {station_id} at {datetime.now(timezone.utc).isoformat()}\n")
        f.write(f"{'='*60}\n\n")

        async with websockets.connect(
            target,
            subprotocols=[subprotocols] if isinstance(subprotocols, str) else subprotocols,
        ) as csms:

            async def cs_to_csms():
                async for msg in ws:
                    log("CS --> CSMS", msg, f)
                    await csms.send(msg)

            async def csms_to_cs():
                async for msg in csms:
                    log("CSMS --> CS", msg, f)
                    await ws.send(msg)

            await asyncio.gather(cs_to_csms(), csms_to_cs())


async def main():
    print(f"OCPP sniffer listening on :{LISTEN_PORT}")
    print(f"Forwarding to {CSMS_URL}")
    print(f"Logging to {LOG_FILE}")
    print(f"Point your charger at ws://localhost:{LISTEN_PORT}/\n")

    async with websockets.serve(
        proxy,
        "0.0.0.0",
        LISTEN_PORT,
        subprotocols=["ocpp2.1", "ocpp2.0.1", "ocpp1.6"],
    ):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
