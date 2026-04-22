#!/usr/bin/env python3
"""
CitrineOS Interactive CLI

Interactive tool for managing charging stations via the CitrineOS REST API
and Hasura GraphQL endpoint. Supports listing stations, sending OCPP commands
(remote start/stop, reset, etc.), and querying transactions.

Usage:
    python3 tools/citrineos_cli.py
    python3 tools/citrineos_cli.py --api-host localhost --api-port 8080 --graphql-port 8090
"""

import argparse
import json
import sys
from typing import Any

try:
    import requests
except ImportError:
    print("Missing 'requests' library. Install with: pip3 install requests")
    sys.exit(1)


# --- Configuration ---

DEFAULT_API_HOST = "localhost"
DEFAULT_API_PORT = 8080
DEFAULT_GRAPHQL_PORT = 8090
DEFAULT_TENANT_ID = 1


class CitrineOSClient:
    def __init__(self, api_host: str, api_port: int, graphql_port: int, tenant_id: int):
        self.api_base = f"http://{api_host}:{api_port}"
        self.graphql_url = f"http://{api_host}:{graphql_port}/v1/graphql"
        self.tenant_id = tenant_id

    # --- GraphQL helpers ---

    def _graphql(self, query: str, variables: dict | None = None) -> dict:
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        resp = requests.post(
            self.graphql_url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "x-hasura-admin-secret": "",  # no secret by default in local dev
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            raise RuntimeError(f"GraphQL error: {json.dumps(data['errors'], indent=2)}")
        return data["data"]

    # --- REST helpers ---

    def _post_message(
        self, module: str, version: str, action: str, station_id: str, body: dict
    ) -> dict:
        url = f"{self.api_base}/ocpp/{version}/{module}/{action}"
        params = {"identifier": station_id, "tenantId": self.tenant_id}
        resp = requests.post(url, json=body, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _get_data(self, module: str, entity: str, params: dict) -> Any:
        url = f"{self.api_base}/data/{module}/{entity}"
        params.setdefault("tenantId", self.tenant_id)
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()

    # --- High-level operations ---

    def list_stations(self) -> list[dict]:
        query = """
        query {
          ChargingStations(order_by: {id: asc}) {
            id
            isOnline
            protocol
            chargePointVendor
            chargePointModel
            chargePointSerialNumber
            firmwareVersion
            tenantId
            locationId
            createdAt
            updatedAt
          }
        }
        """
        return self._graphql(query)["ChargingStations"]

    def get_station_detail(self, station_id: str) -> dict | None:
        query = """
        query ($id: String!) {
          ChargingStations(where: {id: {_eq: $id}}) {
            id
            isOnline
            protocol
            chargePointVendor
            chargePointModel
            chargePointSerialNumber
            chargeBoxSerialNumber
            firmwareVersion
            iccid
            imsi
            meterSerialNumber
            meterType
            tenantId
            locationId
            createdAt
            updatedAt
            Evses {
              id
              connectorId
              Connectors {
                connectorId
              }
            }
            Transactions {
              transactionId
              isActive
              stoppedReason
              createdAt
              updatedAt
            }
            LatestStatusNotifications {
              connectorStatus
              evseId
              connectorId
              timestamp
            }
          }
        }
        """
        rows = self._graphql(query, {"id": station_id})["ChargingStations"]
        return rows[0] if rows else None

    def list_transactions(self, station_id: str | None = None) -> list[dict]:
        where = ""
        variables = {}
        if station_id:
            where = "(where: {stationId: {_eq: $stationId}})"
            variables["stationId"] = station_id

        query = f"""
        query {"($stationId: String!)" if station_id else ""} {{
          Transactions{where} {{
            transactionId
            stationId
            isActive
            stoppedReason
            createdAt
            updatedAt
            evseDatabaseId
            chargingState
            timeSpentCharging
            totalKwh
          }}
        }}
        """
        # Hasura might not have all these columns; fall back gracefully
        try:
            return self._graphql(query, variables if variables else None)["Transactions"]
        except Exception:
            # Simpler query without optional columns
            query_simple = f"""
            query {"($stationId: String!)" if station_id else ""} {{
              Transactions{where} {{
                transactionId
                stationId
                isActive
                stoppedReason
                createdAt
                updatedAt
              }}
            }}
            """
            return self._graphql(query_simple, variables if variables else None)["Transactions"]

    def request_start_transaction(
        self,
        station_id: str,
        id_token: str,
        id_token_type: str = "Central",
        evse_id: int | None = None,
        remote_start_id: int = 1,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        body: dict[str, Any] = {
            "idToken": {"idToken": id_token, "type": id_token_type},
            "remoteStartId": remote_start_id,
        }
        if evse_id is not None:
            body["evseId"] = evse_id
        return self._post_message(
            "evdriver", ocpp_version, "requestStartTransaction", station_id, body
        )

    def request_stop_transaction(
        self, station_id: str, transaction_id: str, ocpp_version: str = "2.0.1"
    ) -> dict:
        body = {"transactionId": transaction_id}
        return self._post_message(
            "evdriver", ocpp_version, "requestStopTransaction", station_id, body
        )

    def reset_station(
        self, station_id: str, reset_type: str = "Immediate", ocpp_version: str = "2.0.1"
    ) -> dict:
        body = {"type": reset_type}
        return self._post_message("configuration", ocpp_version, "reset", station_id, body)

    def change_availability(
        self,
        station_id: str,
        operative: bool = True,
        evse_id: int | None = None,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        body: dict[str, Any] = {
            "operationalStatus": "Operative" if operative else "Inoperative",
        }
        if evse_id is not None:
            body["evse"] = {"id": evse_id}
        return self._post_message(
            "configuration", ocpp_version, "changeAvailability", station_id, body
        )

    def unlock_connector(
        self,
        station_id: str,
        evse_id: int,
        connector_id: int,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        body = {"evseId": evse_id, "connectorId": connector_id}
        return self._post_message(
            "evdriver", ocpp_version, "unlockConnector", station_id, body
        )

    def trigger_message(
        self,
        station_id: str,
        requested_message: str,
        evse_id: int | None = None,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        body: dict[str, Any] = {"requestedMessage": requested_message}
        if evse_id is not None:
            body["evse"] = {"id": evse_id}
        return self._post_message(
            "configuration", ocpp_version, "triggerMessage", station_id, body
        )

    def get_variables(
        self,
        station_id: str,
        component_name: str,
        variable_name: str,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        body = {
            "getVariableData": [
                {
                    "component": {"name": component_name},
                    "variable": {"name": variable_name},
                }
            ]
        }
        return self._post_message(
            "monitoring", ocpp_version, "getVariables", station_id, body
        )

    def set_charging_profile(
        self,
        station_id: str,
        evse_id: int,
        profile: dict,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        body = {"evseId": evse_id, "chargingProfile": profile}
        return self._post_message(
            "smartcharging", ocpp_version, "setChargingProfile", station_id, body
        )

    def clear_charging_profile(
        self,
        station_id: str,
        charging_profile_id: int | None = None,
        evse_id: int | None = None,
        charging_profile_purpose: str | None = None,
        stack_level: int | None = None,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        criteria: dict[str, Any] = {}
        if evse_id is not None:
            criteria["evseId"] = evse_id
        if charging_profile_purpose:
            criteria["chargingProfilePurpose"] = charging_profile_purpose
        if stack_level is not None:
            criteria["stackLevel"] = stack_level
        body: dict[str, Any] = {}
        if charging_profile_id is not None:
            body["chargingProfileId"] = charging_profile_id
        if criteria:
            body["chargingProfileCriteria"] = criteria
        return self._post_message(
            "smartcharging", ocpp_version, "clearChargingProfile", station_id, body
        )

    def get_charging_profiles(
        self,
        station_id: str,
        request_id: int = 1,
        evse_id: int | None = None,
        charging_profile_purpose: str | None = None,
        charging_profile_id: list[int] | None = None,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        criteria: dict[str, Any] = {}
        if charging_profile_purpose:
            criteria["chargingProfilePurpose"] = charging_profile_purpose
        if charging_profile_id:
            criteria["chargingProfileId"] = charging_profile_id
        body: dict[str, Any] = {"requestId": request_id, "chargingProfile": criteria}
        if evse_id is not None:
            body["evseId"] = evse_id
        return self._post_message(
            "smartcharging", ocpp_version, "getChargingProfiles", station_id, body
        )

    def clear_cache(self, station_id: str, ocpp_version: str = "2.0.1") -> dict:
        return self._post_message("evdriver", ocpp_version, "clearCache", station_id, {})

    def get_base_report(
        self, station_id: str, request_id: int = 1, ocpp_version: str = "2.0.1"
    ) -> dict:
        body = {"requestId": request_id, "reportBase": "FullInventory"}
        return self._post_message(
            "reporting", ocpp_version, "getBaseReport", station_id, body
        )

    def get_composite_schedule(
        self,
        station_id: str,
        evse_id: int,
        duration: int = 3600,
        ocpp_version: str = "2.0.1",
    ) -> dict:
        body = {"evseId": evse_id, "duration": duration}
        return self._post_message(
            "smartcharging", ocpp_version, "getCompositeSchedule", station_id, body
        )

    def update_dynamic_schedule(
        self,
        station_id: str,
        charging_profile_id: int,
        schedule_update: dict,
        ocpp_version: str = "2.1",
    ) -> dict:
        body = {
            "chargingProfileId": charging_profile_id,
            "scheduleUpdate": schedule_update,
        }
        return self._post_message(
            "smartcharging", ocpp_version, "updateDynamicSchedule", station_id, body
        )

    # --- Smart helpers (defaults discovery) ---

    def get_first_online_station(self) -> str | None:
        """Return ID of first online station, or None if none online."""
        for s in self.list_stations():
            if s.get("isOnline"):
                return s["id"]
        # Fallback to first station if none online
        stations = self.list_stations()
        return stations[0]["id"] if stations else None

    def get_latest_active_transaction(self, station_id: str | None = None) -> dict | None:
        """Return the most recently created active transaction (optionally filtered by station)."""
        txns = self.list_transactions(station_id)
        active = [t for t in txns if t.get("isActive")]
        if not active:
            return None
        active.sort(key=lambda t: t.get("createdAt", ""), reverse=True)
        return active[0]

    def get_charging_profile_db_id(
        self, station_id: str, transaction_id: str | None = None
    ) -> int | None:
        """Find the most recent dynamic-capable profile id (one whose schedule periods
        include operationMode like CentralSetpoint/ExternalSetpoint).
        UpdateDynamicSchedule rejects profiles without a setpoint-supporting operationMode
        ("ChargingSchedulePeriodUnsupportedLimitSetpoint").
        Falls back to the latest active profile if no dynamic-capable profile is found.
        """
        # Try to find profiles whose periods have a setpoint-capable operationMode.
        # The exact GraphQL relation/field names depend on Hasura introspection; try a few.
        candidate_queries = [
            # Try ChargingSchedules -> ChargingSchedulePeriods (typical pluralization)
            """
            query ($s: String!) {
              ChargingProfiles(
                where: {
                  stationId: {_eq: $s},
                  ChargingSchedules: {ChargingSchedulePeriods: {operationMode: {_in: ["CentralSetpoint","ExternalSetpoint"]}}}
                },
                order_by: {id: desc},
                limit: 1
              ) { id }
            }
            """,
            # Singular variant
            """
            query ($s: String!) {
              ChargingProfiles(
                where: {
                  stationId: {_eq: $s},
                  ChargingSchedule: {ChargingSchedulePeriod: {operationMode: {_in: ["CentralSetpoint","ExternalSetpoint"]}}}
                },
                order_by: {id: desc},
                limit: 1
              ) { id }
            }
            """,
        ]
        for q in candidate_queries:
            try:
                rows = self._graphql(q, {"s": station_id})["ChargingProfiles"]
                if rows:
                    return rows[0]["id"]
            except Exception:
                continue

        # Fallback: latest active profile (may not be dynamic-capable)
        if transaction_id:
            query = """
            query ($stationId: String!, $txId: String!) {
              ChargingProfiles(
                where: {
                  stationId: {_eq: $stationId},
                  isActive: {_eq: true},
                  Transaction: {transactionId: {_eq: $txId}}
                },
                order_by: {id: desc},
                limit: 1
              ) { id }
            }
            """
            try:
                rows = self._graphql(
                    query, {"stationId": station_id, "txId": transaction_id}
                )["ChargingProfiles"]
                if rows:
                    return rows[0]["id"]
            except Exception:
                pass
        try:
            rows = self._graphql(
                """query ($s: String!) { ChargingProfiles(where: {stationId:{_eq:$s}, isActive:{_eq:true}}, order_by:{id:desc}, limit:1) { id } }""",
                {"s": station_id},
            )["ChargingProfiles"]
            return rows[0]["id"] if rows else None
        except Exception:
            return None


# --- Display helpers ---

def print_header(text: str):
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}")


def print_json(data: Any):
    print(json.dumps(data, indent=2, default=str))


def print_table(rows: list[dict], columns: list[str]):
    if not rows:
        print("  (no results)")
        return

    # Calculate column widths
    widths = {col: len(col) for col in columns}
    for row in rows:
        for col in columns:
            val = str(row.get(col, ""))
            widths[col] = max(widths[col], len(val))

    # Header
    header = " | ".join(col.ljust(widths[col]) for col in columns)
    print(f"  {header}")
    print(f"  {'-+-'.join('-' * widths[col] for col in columns)}")

    # Rows
    for row in rows:
        line = " | ".join(str(row.get(col, "")).ljust(widths[col]) for col in columns)
        print(f"  {line}")


def prompt(msg: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    val = input(f"  {msg}{suffix}: ").strip()
    return val if val else (default or "")


def prompt_int(msg: str, default: int | None = None) -> int:
    val = prompt(msg, str(default) if default is not None else None)
    return int(val)


def pick_station(client: CitrineOSClient) -> str | None:
    stations = client.list_stations()
    if not stations:
        print("  No charging stations found.")
        return None
    # Default to first online station
    default_idx = next(
        (i + 1 for i, s in enumerate(stations) if s.get("isOnline")), 1
    )
    print()
    for i, s in enumerate(stations):
        online = "ONLINE " if s.get("isOnline") else "OFFLINE"
        proto = s.get("protocol") or "?"
        vendor = s.get("chargePointVendor") or ""
        model = s.get("chargePointModel") or ""
        marker = " <- default" if (i + 1) == default_idx else ""
        print(f"  [{i + 1}] {s['id']}  ({online}, {proto}) {vendor} {model}{marker}")
    print(f"  [0] Enter station ID manually")
    choice = prompt("Select station", str(default_idx))
    if choice == "0":
        return prompt("Station ID")
    idx = int(choice) - 1
    if 0 <= idx < len(stations):
        return stations[idx]["id"]
    print("  Invalid choice.")
    return None


def pick_version() -> str:
    v = prompt("OCPP version (2.0.1 / 2.1 / 1.6)", "2.1")
    return v


def pick_active_transaction(client: CitrineOSClient, station_id: str) -> str | None:
    """Show active transactions and let user pick one. Returns transactionId."""
    txns = client.list_transactions(station_id)
    active = [t for t in txns if t.get("isActive")]
    if not active:
        manual = prompt("No active transactions found. Enter transactionId manually (or empty to skip)", "")
        return manual or None
    if len(active) == 1:
        tx_id = active[0]["transactionId"]
        print(f"  Auto-selected active transaction: {tx_id}")
        return tx_id
    # Multiple active -- show and pick latest as default
    active.sort(key=lambda t: t.get("createdAt", ""), reverse=True)
    print("\n  Active transactions (newest first):")
    for i, t in enumerate(active):
        print(f"    [{i + 1}] {t['transactionId']}  ({t.get('chargingState','?')}, since {t.get('createdAt','?')})")
    choice = prompt("Select transaction", "1")
    idx = int(choice) - 1
    if 0 <= idx < len(active):
        return active[idx]["transactionId"]
    return None


# --- Menu actions ---

def action_list_stations(client: CitrineOSClient):
    print_header("Charging Stations")
    stations = client.list_stations()
    print_table(
        stations,
        ["id", "isOnline", "protocol", "chargePointVendor", "chargePointModel", "tenantId"],
    )
    print(f"\n  Total: {len(stations)} station(s)")


def action_station_detail(client: CitrineOSClient):
    print_header("Station Detail")
    station_id = pick_station(client)
    if not station_id:
        return
    detail = client.get_station_detail(station_id)
    if not detail:
        print(f"  Station '{station_id}' not found.")
        return
    print_json(detail)


def action_list_transactions(client: CitrineOSClient):
    print_header("Transactions")
    filter_station = prompt("Filter by station ID (leave empty for all)", "")
    txns = client.list_transactions(filter_station or None)
    print_table(
        txns,
        ["transactionId", "stationId", "isActive", "stoppedReason", "createdAt"],
    )
    print(f"\n  Total: {len(txns)} transaction(s)")


def action_remote_start(client: CitrineOSClient):
    print_header("Request Start Transaction")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    id_token = prompt("ID Token value", "DEADBEEF")
    id_token_type = prompt("ID Token type (Central/eMAID/ISO14443/ISO15693)", "Central")
    evse_raw = prompt("EVSE ID (leave empty to skip)", "")
    evse_id = int(evse_raw) if evse_raw else None
    remote_start_id = prompt_int("Remote start ID", 1)

    print("\n  Sending RequestStartTransaction...")
    try:
        result = client.request_start_transaction(
            station_id, id_token, id_token_type, evse_id, remote_start_id, version
        )
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_remote_stop(client: CitrineOSClient):
    print_header("Request Stop Transaction")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    tx_id = pick_active_transaction(client, station_id)
    if not tx_id:
        print("  No transaction selected.")
        return
    print("\n  Sending RequestStopTransaction...")
    try:
        result = client.request_stop_transaction(station_id, tx_id, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_reset(client: CitrineOSClient):
    print_header("Reset Station")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    reset_type = prompt("Reset type (Immediate/OnIdle)", "Immediate")
    print("\n  Sending Reset...")
    try:
        result = client.reset_station(station_id, reset_type, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_change_availability(client: CitrineOSClient):
    print_header("Change Availability")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    status = prompt("Status (Operative/Inoperative)", "Operative")
    evse_raw = prompt("EVSE ID (leave empty for whole station)", "")
    evse_id = int(evse_raw) if evse_raw else None
    print("\n  Sending ChangeAvailability...")
    try:
        result = client.change_availability(
            station_id, status == "Operative", evse_id, version
        )
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_unlock_connector(client: CitrineOSClient):
    print_header("Unlock Connector")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    evse_id = prompt_int("EVSE ID", 1)
    connector_id = prompt_int("Connector ID", 1)
    print("\n  Sending UnlockConnector...")
    try:
        result = client.unlock_connector(station_id, evse_id, connector_id, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_trigger_message(client: CitrineOSClient):
    print_header("Trigger Message")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    print("\n  Available message triggers:")
    triggers = [
        "BootNotification",
        "Heartbeat",
        "MeterValues",
        "StatusNotification",
        "FirmwareStatusNotification",
        "TransactionEvent",
        "LogStatusNotification",
        "SignChargingStationCertificate",
    ]
    for i, t in enumerate(triggers):
        print(f"    [{i + 1}] {t}")
    choice = prompt("Select or type message name", "1")
    if choice.isdigit() and 1 <= int(choice) <= len(triggers):
        requested = triggers[int(choice) - 1]
    else:
        requested = choice
    evse_raw = prompt("EVSE ID (leave empty to skip)", "")
    evse_id = int(evse_raw) if evse_raw else None
    print(f"\n  Sending TriggerMessage ({requested})...")
    try:
        result = client.trigger_message(station_id, requested, evse_id, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_get_variables(client: CitrineOSClient):
    print_header("Get Variables")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    component = prompt("Component name (e.g., OCPPCommCtrlr, ChargingStation)", "ChargingStation")
    variable = prompt("Variable name (e.g., Model, Vendor, AvailabilityState)")
    print(f"\n  Sending GetVariables ({component}.{variable})...")
    try:
        result = client.get_variables(station_id, component, variable, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_clear_cache(client: CitrineOSClient):
    print_header("Clear Cache")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    print("\n  Sending ClearCache...")
    try:
        result = client.clear_cache(station_id, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_get_base_report(client: CitrineOSClient):
    print_header("Get Base Report")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    request_id = prompt_int("Request ID", 1)
    print("\n  Sending GetBaseReport (FullInventory)...")
    try:
        result = client.get_base_report(station_id, request_id, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_set_charging_profile(client: CitrineOSClient):
    print_header("Set Charging Profile")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    evse_id = prompt_int("EVSE ID", 1)

    purpose = prompt("Purpose (TxProfile/TxDefaultProfile/ChargingStationMaxProfile)", "TxProfile")

    # Auto-fetch latest active transaction for TxProfile
    transaction_id = ""
    if purpose == "TxProfile":
        active_tx = client.get_latest_active_transaction(station_id)
        if active_tx:
            tx_default = active_tx["transactionId"]
            print(f"  Latest active transaction: {tx_default}")
            transaction_id = prompt("Transaction ID", tx_default)
        else:
            transaction_id = prompt("Transaction ID (no active transaction found)", "")

    # Auto-increment profile_id and stack_level if a profile already exists
    next_profile_id = 1
    next_stack = 0
    try:
        existing = client._graphql(
            """query ($s: String!) { ChargingProfiles(where: {stationId:{_eq:$s}}, order_by:{id:desc}, limit:1) { id stackLevel } }""",
            {"s": station_id},
        )["ChargingProfiles"]
        if existing:
            next_profile_id = (existing[0]["id"] or 0) + 1
            next_stack = (existing[0]["stackLevel"] or 0) + 1
    except Exception:
        pass

    profile_id = prompt_int("Charging profile ID", next_profile_id)
    stack_level = prompt_int("Stack level (must be unique per tx)", next_stack)
    unit = prompt("Charging rate unit (W / A)", "W")
    operation_mode = prompt("Operation mode (CentralSetpoint=dynamic / ChargingOnly / empty)", "CentralSetpoint")
    setpoint_raw = prompt("Setpoint (positive=charge, negative=discharge, empty=skip)", "7200")
    limit = prompt("Limit (max charge rate, always positive)", "11000")
    discharge_limit_raw = prompt("Discharge limit (negative, e.g. -11000, empty=skip)", "-11000")
    num_phases = prompt("Number of phases (1/3, empty=skip)", "")

    period: dict[str, Any] = {"startPeriod": 0, "limit": float(limit)}
    if num_phases:
        period["numberPhases"] = int(num_phases)
    if setpoint_raw:
        period["setpoint"] = float(setpoint_raw)
    if discharge_limit_raw:
        period["dischargeLimit"] = float(discharge_limit_raw)
    if operation_mode:
        period["operationMode"] = operation_mode

    from datetime import datetime, timezone

    start_schedule = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    profile: dict[str, Any] = {
        "id": profile_id,
        "stackLevel": stack_level,
        "chargingProfilePurpose": purpose,
        "chargingProfileKind": "Absolute",
        **({"transactionId": transaction_id} if transaction_id else {}),
        "chargingSchedule": [
            {
                "id": profile_id,
                "startSchedule": start_schedule,
                "chargingRateUnit": unit,
                "chargingSchedulePeriod": [period],
            }
        ],
    }

    print("\n  Profile to send:")
    print_json(profile)
    confirm = prompt("Send? (y/n)", "y")
    if confirm.lower() != "y":
        print("  Cancelled.")
        return

    print("\n  Sending SetChargingProfile...")
    try:
        result = client.set_charging_profile(station_id, evse_id, profile, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_get_charging_profiles(client: CitrineOSClient):
    print_header("Get Charging Profiles")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    request_id = prompt_int("Request ID", 1)
    evse_raw = prompt("EVSE ID (leave empty for all)", "")
    evse_id = int(evse_raw) if evse_raw else None

    purpose_raw = prompt("Filter by purpose (leave empty for all)", "")
    purpose = purpose_raw if purpose_raw else None

    print("\n  Sending GetChargingProfiles...")
    try:
        result = client.get_charging_profiles(
            station_id, request_id, evse_id, purpose, ocpp_version=version
        )
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_clear_charging_profile(client: CitrineOSClient):
    print_header("Clear Charging Profile")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()

    profile_id_raw = prompt("Charging profile ID to clear (leave empty to use criteria)", "")
    profile_id = int(profile_id_raw) if profile_id_raw else None

    evse_id = None
    purpose = None
    stack_level = None
    if not profile_id:
        evse_raw = prompt("Filter by EVSE ID (leave empty to skip)", "")
        evse_id = int(evse_raw) if evse_raw else None
        purpose = prompt("Filter by purpose (leave empty to skip)", "") or None
        stack_raw = prompt("Filter by stack level (leave empty to skip)", "")
        stack_level = int(stack_raw) if stack_raw else None

    print("\n  Sending ClearChargingProfile...")
    try:
        result = client.clear_charging_profile(
            station_id, profile_id, evse_id, purpose, stack_level, version
        )
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_get_composite_schedule(client: CitrineOSClient):
    print_header("Get Composite Schedule")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    evse_id = prompt_int("EVSE ID", 0)
    duration = prompt_int("Duration in seconds", 3600)
    print(f"\n  Sending GetCompositeSchedule (EVSE {evse_id}, {duration}s)...")
    try:
        result = client.get_composite_schedule(station_id, evse_id, duration, version)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_update_dynamic_schedule(client: CitrineOSClient):
    print_header("Update Dynamic Schedule (OCPP 2.1)")
    station_id = pick_station(client)
    if not station_id:
        return

    # Auto-pick latest active transaction for default profile lookup
    active_tx = client.get_latest_active_transaction(station_id)
    tx_id_default = active_tx["transactionId"] if active_tx else None

    suggested_profile_id = client.get_charging_profile_db_id(station_id, tx_id_default)
    profile_id = prompt_int(
        "Charging profile ID to update (DB id of the active profile)",
        suggested_profile_id or 1,
    )

    print("\n  Schedule update fields (leave empty to skip):")
    setpoint_raw = prompt("setpoint (positive=charge, negative=discharge)", "")
    limit_raw = prompt("limit (max charge rate, positive)", "")
    discharge_limit_raw = prompt("dischargeLimit (max discharge rate, negative)", "")
    setpoint_reactive_raw = prompt("setpointReactive (reactive power)", "")

    schedule_update: dict[str, Any] = {}
    if setpoint_raw:
        schedule_update["setpoint"] = float(setpoint_raw)
    if limit_raw:
        schedule_update["limit"] = float(limit_raw)
    if discharge_limit_raw:
        schedule_update["dischargeLimit"] = float(discharge_limit_raw)
    if setpoint_reactive_raw:
        schedule_update["setpointReactive"] = float(setpoint_reactive_raw)

    if not schedule_update:
        print("  No fields to update.")
        return

    body_preview = {"chargingProfileId": profile_id, "scheduleUpdate": schedule_update}
    print("\n  Will send:")
    print_json(body_preview)
    confirm = prompt("Send? (y/n)", "y")
    if confirm.lower() != "y":
        print("  Cancelled.")
        return

    try:
        result = client.update_dynamic_schedule(station_id, profile_id, schedule_update, "2.1")
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def _bpt_send_setpoint(client: CitrineOSClient, mode: str):
    """Quick BPT helper: send a SetChargingProfile with a single setpoint.
    mode is 'charge' or 'discharge'.
    """
    label = "Charge" if mode == "charge" else "Discharge"
    sign = 1 if mode == "charge" else -1

    print_header(f"BPT Quick: {label}")
    station_id = client.get_first_online_station()
    if not station_id:
        print("  No online station found.")
        return
    print(f"  Station: {station_id}")

    active_tx = client.get_latest_active_transaction(station_id)
    if not active_tx:
        print("  No active transaction. Start a transaction first.")
        return
    transaction_id = active_tx["transactionId"]
    print(f"  Transaction: {transaction_id}")

    default_value = "7200" if mode == "charge" else "7200"
    value_str = prompt(f"{label} value in W (positive number)", default_value)
    value = float(value_str)
    setpoint = sign * abs(value)

    # Auto-increment ID/stack
    next_profile_id = 1
    next_stack = 1
    try:
        existing = client._graphql(
            """query ($s: String!) { ChargingProfiles(where: {stationId:{_eq:$s}}, order_by:{id:desc}, limit:1) { id stackLevel } }""",
            {"s": station_id},
        )["ChargingProfiles"]
        if existing:
            next_profile_id = (existing[0]["id"] or 0) + 1
            next_stack = (existing[0]["stackLevel"] or 0) + 1
    except Exception:
        pass

    from datetime import datetime, timezone
    period: dict[str, Any] = {
        "startPeriod": 0,
        "limit": max(7200.0, abs(setpoint)),
        "setpoint": setpoint,
        "operationMode": "CentralSetpoint",
    }
    if mode == "discharge":
        period["dischargeLimit"] = -max(7200.0, abs(setpoint))

    profile = {
        "id": next_profile_id,
        "stackLevel": next_stack,
        "chargingProfilePurpose": "TxProfile",
        "chargingProfileKind": "Absolute",
        "transactionId": transaction_id,
        "chargingSchedule": [{
            "id": next_profile_id,
            "startSchedule": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "chargingRateUnit": "W",
            "chargingSchedulePeriod": [period],
        }],
    }

    print("\n  Sending profile:")
    print_json(profile)
    try:
        result = client.set_charging_profile(station_id, 1, profile, "2.1")
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_bpt_charge(client: CitrineOSClient):
    _bpt_send_setpoint(client, "charge")


def action_bpt_discharge(client: CitrineOSClient):
    _bpt_send_setpoint(client, "discharge")


def action_bpt_dynamic_update(client: CitrineOSClient):
    """Quick BPT: send UpdateDynamicSchedule for the active profile."""
    print_header("BPT Quick: Update Dynamic Setpoint")
    station_id = client.get_first_online_station()
    if not station_id:
        print("  No online station found.")
        return
    print(f"  Station: {station_id}")

    active_tx = client.get_latest_active_transaction(station_id)
    if not active_tx:
        print("  No active transaction.")
        return
    print(f"  Transaction: {active_tx['transactionId']}")

    profile_id = client.get_charging_profile_db_id(station_id, active_tx["transactionId"])
    if not profile_id:
        print("  No active charging profile found. Send a SetChargingProfile first.")
        return
    print(f"  Profile DB id: {profile_id}")

    setpoint_str = prompt("New setpoint in W (positive=charge, negative=discharge)", "-7200")
    setpoint = float(setpoint_str)

    schedule_update = {"setpoint": setpoint}
    if setpoint > 0:
        schedule_update["limit"] = max(7200.0, setpoint)
    else:
        schedule_update["dischargeLimit"] = min(-7200.0, setpoint)

    print("\n  Sending UpdateDynamicSchedule:")
    print_json({"chargingProfileId": profile_id, "scheduleUpdate": schedule_update})
    try:
        result = client.update_dynamic_schedule(station_id, profile_id, schedule_update, "2.1")
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_bpt_stop(client: CitrineOSClient):
    """Quick BPT: stop the latest active transaction on the first online station."""
    print_header("BPT Quick: Stop Active Transaction")
    station_id = client.get_first_online_station()
    if not station_id:
        print("  No online station found.")
        return
    active_tx = client.get_latest_active_transaction(station_id)
    if not active_tx:
        print("  No active transaction to stop.")
        return
    tx_id = active_tx["transactionId"]
    print(f"  Stopping {tx_id} on {station_id}")
    try:
        result = client.request_stop_transaction(station_id, tx_id, "2.1")
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_bpt_status(client: CitrineOSClient):
    """Show current BPT-relevant state: online stations, active transactions, latest profile."""
    print_header("BPT Status")
    stations = client.list_stations()
    online = [s for s in stations if s.get("isOnline")]
    print(f"  Stations: {len(stations)} total, {len(online)} online")
    for s in online:
        print(f"    - {s['id']}  ({s.get('protocol','?')})")
        active_tx = client.get_latest_active_transaction(s["id"])
        if active_tx:
            print(f"      tx: {active_tx['transactionId']}  state={active_tx.get('chargingState','?')}")
            pid = client.get_charging_profile_db_id(s["id"], active_tx["transactionId"])
            if pid:
                print(f"      profile DB id: {pid}")
        else:
            print(f"      (no active transaction)")


def action_raw_post(client: CitrineOSClient):
    print_header("Raw OCPP Message (Advanced)")
    station_id = pick_station(client)
    if not station_id:
        return
    version = pick_version()
    module = prompt("Module (evdriver/configuration/monitoring/smartcharging/reporting/transactions)")
    action = prompt("Action (camelCase, e.g., requestStartTransaction)")
    print("  Enter JSON body (single line):")
    body_str = input("  > ").strip()
    try:
        body = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError as e:
        print(f"  Invalid JSON: {e}")
        return
    print(f"\n  POST /ocpp/{version}/{module}/{action}?identifier={station_id}")
    try:
        result = client._post_message(module, version, action, station_id, body)
        print("  Response:")
        print_json(result)
    except requests.HTTPError as e:
        print(f"  HTTP Error: {e}")
        if e.response is not None:
            print(f"  Body: {e.response.text}")


def action_raw_graphql(client: CitrineOSClient):
    print_header("Raw GraphQL Query")
    print("  Enter GraphQL query (end with empty line):")
    lines = []
    while True:
        line = input("  > ")
        if not line.strip():
            break
        lines.append(line)
    query = "\n".join(lines)
    if not query.strip():
        print("  Empty query.")
        return
    try:
        result = client._graphql(query)
        print("  Result:")
        print_json(result)
    except Exception as e:
        print(f"  Error: {e}")


# --- Main menu ---

MENU = [
    # --- BPT quick actions (top of menu for easy access) ---
    ("BPT: Status", action_bpt_status),
    ("BPT: Quick Charge (auto)", action_bpt_charge),
    ("BPT: Quick Discharge (auto)", action_bpt_discharge),
    ("BPT: Update Dynamic Setpoint (auto)", action_bpt_dynamic_update),
    ("BPT: Stop Active Transaction (auto)", action_bpt_stop),
    # --- Standard actions ---
    ("List Charging Stations", action_list_stations),
    ("Station Detail", action_station_detail),
    ("List Transactions", action_list_transactions),
    ("Remote Start Transaction", action_remote_start),
    ("Remote Stop Transaction", action_remote_stop),
    ("Reset Station", action_reset),
    ("Change Availability", action_change_availability),
    ("Unlock Connector", action_unlock_connector),
    ("Trigger Message", action_trigger_message),
    ("Get Variables", action_get_variables),
    ("Set Charging Profile", action_set_charging_profile),
    ("Update Dynamic Schedule", action_update_dynamic_schedule),
    ("Get Charging Profiles", action_get_charging_profiles),
    ("Clear Charging Profile", action_clear_charging_profile),
    ("Get Composite Schedule", action_get_composite_schedule),
    ("Clear Cache", action_clear_cache),
    ("Get Base Report", action_get_base_report),
    ("Raw OCPP Message", action_raw_post),
    ("Raw GraphQL Query", action_raw_graphql),
]


def main():
    parser = argparse.ArgumentParser(description="CitrineOS Interactive CLI")
    parser.add_argument("--api-host", default=DEFAULT_API_HOST, help="API host (default: localhost)")
    parser.add_argument("--api-port", type=int, default=DEFAULT_API_PORT, help="REST API port (default: 8080)")
    parser.add_argument("--graphql-port", type=int, default=DEFAULT_GRAPHQL_PORT, help="Hasura GraphQL port (default: 8090)")
    parser.add_argument("--tenant-id", type=int, default=DEFAULT_TENANT_ID, help="Tenant ID (default: 1)")
    args = parser.parse_args()

    client = CitrineOSClient(args.api_host, args.api_port, args.graphql_port, args.tenant_id)

    print_header("CitrineOS Interactive CLI")
    print(f"  REST API:  {client.api_base}")
    print(f"  GraphQL:   {client.graphql_url}")
    print(f"  Tenant ID: {client.tenant_id}")

    while True:
        print(f"\n{'─' * 60}")
        for i, (label, _) in enumerate(MENU):
            print(f"  [{i + 1:2d}] {label}")
        print(f"  [ 0] Exit")
        print()

        try:
            choice = prompt("Choice", "1")
        except (EOFError, KeyboardInterrupt):
            print("\n  Bye!")
            break

        if choice == "0" or choice.lower() in ("q", "quit", "exit"):
            print("  Bye!")
            break

        try:
            idx = int(choice) - 1
            if 0 <= idx < len(MENU):
                try:
                    MENU[idx][1](client)
                except requests.ConnectionError:
                    print(f"\n  Connection failed. Is CitrineOS running at {client.api_base}?")
                except Exception as e:
                    print(f"\n  Error: {e}")
            else:
                print("  Invalid choice.")
        except ValueError:
            print("  Invalid choice.")


if __name__ == "__main__":
    main()
