// CitrineOS API client. Mirrors the Python CLI's CitrineOSClient.
// All paths are proxied by Vite (see vite.config.js).

const TENANT_ID = 1;

async function gql(query, variables) {
  const resp = await fetch('/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`GraphQL HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.errors) throw new Error(`GraphQL: ${JSON.stringify(data.errors)}`);
  return data.data;
}

async function postOcpp(module, version, action, stationId, body) {
  const url = `/ocpp/${version}/${module}/${action}?identifier=${encodeURIComponent(stationId)}&tenantId=${TENANT_ID}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);
  return parsed;
}

export async function listStations() {
  const data = await gql(`
    query {
      ChargingStations(order_by: { id: asc }) {
        id
        isOnline
        protocol
        chargePointVendor
        chargePointModel
      }
    }
  `);
  return data.ChargingStations || [];
}

export async function listTransactions(stationId) {
  const where = stationId ? '(where: { stationId: { _eq: $s } })' : '';
  const args = stationId ? '($s: String!)' : '';
  const query = `
    query ${args} {
      Transactions${where} {
        transactionId
        stationId
        evseId
        isActive
        chargingState
        stoppedReason
        totalKwh
        createdAt
        updatedAt
      }
    }
  `;
  try {
    const data = await gql(query, stationId ? { s: stationId } : undefined);
    return data.Transactions || [];
  } catch {
    // Fallback if some columns aren't available
    const simple = `
      query ${args} {
        Transactions${where} {
          transactionId
          stationId
          isActive
          stoppedReason
          createdAt
        }
      }
    `;
    const data = await gql(simple, stationId ? { s: stationId } : undefined);
    return data.Transactions || [];
  }
}

export async function getLatestActiveTransaction(stationId) {
  const txns = await listTransactions(stationId);
  const active = txns.filter((t) => t.isActive);
  if (!active.length) return null;
  active.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return active[0];
}

/** Try to find a profile whose schedule period actually has CentralSetpoint operationMode.
 *  This is the only kind of profile that UpdateDynamicSchedule can update. Returns the
 *  OCPP profile id (which is also the DB id in CitrineOS), or null.
 */
export async function getDynamicProfileId(stationId) {
  const variants = [
    `query ($s: String!) {
       ChargingProfiles(
         where: {
           stationId: { _eq: $s },
           ChargingSchedules: { ChargingSchedulePeriods: { operationMode: { _in: ["CentralSetpoint", "ExternalSetpoint"] } } }
         },
         order_by: { id: desc },
         limit: 1
       ) { id }
     }`,
    `query ($s: String!) {
       ChargingProfiles(
         where: {
           stationId: { _eq: $s },
           ChargingSchedule: { ChargingSchedulePeriod: { operationMode: { _in: ["CentralSetpoint", "ExternalSetpoint"] } } }
         },
         order_by: { id: desc },
         limit: 1
       ) { id }
     }`,
  ];
  for (const q of variants) {
    try {
      const data = await gql(q, { s: stationId });
      if (data.ChargingProfiles && data.ChargingProfiles.length) {
        return data.ChargingProfiles[0].id;
      }
    } catch {
      // try next
    }
  }
  // Fallback: latest active profile (may not actually be dynamic-capable)
  try {
    const data = await gql(
      `query ($s: String!) {
         ChargingProfiles(
           where: { stationId: { _eq: $s }, isActive: { _eq: true } },
           order_by: { id: desc },
           limit: 1
         ) { id }
       }`,
      { s: stationId },
    );
    return data.ChargingProfiles && data.ChargingProfiles.length
      ? data.ChargingProfiles[0].id
      : null;
  } catch {
    return null;
  }
}

/** Fetch the latest charging profile id+stackLevel for a station so we can pick fresh values
 *  when sending a new SetChargingProfile (must be unique per transaction).
 */
export async function getNextProfileIdAndStack(stationId) {
  try {
    const data = await gql(
      `query ($s: String!) {
         ChargingProfiles(where: { stationId: { _eq: $s } }, order_by: { id: desc }, limit: 1) {
           id
           stackLevel
         }
       }`,
      { s: stationId },
    );
    if (data.ChargingProfiles && data.ChargingProfiles.length) {
      const top = data.ChargingProfiles[0];
      return { id: (top.id || 0) + 1, stackLevel: (top.stackLevel || 0) + 1 };
    }
  } catch {
    // ignore
  }
  return { id: 1, stackLevel: 1 };
}

export function requestStartTransaction(stationId, opts) {
  const body = {
    idToken: { idToken: opts.idToken, type: opts.idTokenType },
    remoteStartId: opts.remoteStartId,
  };
  if (opts.evseId !== undefined && opts.evseId !== null) body.evseId = opts.evseId;
  return postOcpp('evdriver', opts.version || '2.1', 'requestStartTransaction', stationId, body);
}

export function requestStopTransaction(stationId, transactionId, version = '2.1') {
  return postOcpp('evdriver', version, 'requestStopTransaction', stationId, { transactionId });
}

export function setChargingProfile(stationId, evseId, profile, version = '2.1') {
  return postOcpp('smartcharging', version, 'setChargingProfile', stationId, {
    evseId,
    chargingProfile: profile,
  });
}

export function updateDynamicSchedule(stationId, chargingProfileId, scheduleUpdate, version = '2.1') {
  return postOcpp('smartcharging', version, 'updateDynamicSchedule', stationId, {
    chargingProfileId,
    scheduleUpdate,
  });
}

/** Build a CentralSetpoint TxProfile with the given setpoint and limits.
 *  Uses chargingRateUnit='A' (Amperes) — libocpp's W↔A conversion is non-deterministic
 *  (depends on EV-negotiated nominal voltage), so values get silently rescaled. Sticking
 *  to A means the slider value lands at the EV without conversion.
 */
export function buildDynamicProfile({ id, stackLevel, transactionId, setpoint, maxCharge, maxDischarge }) {
  const period = {
    startPeriod: 0,
    limit: maxCharge,
    setpoint,
    operationMode: 'CentralSetpoint',
  };
  if (maxDischarge !== undefined && maxDischarge !== null) {
    period.dischargeLimit = -Math.abs(maxDischarge);
  }
  return {
    id,
    stackLevel,
    chargingProfilePurpose: 'TxProfile',
    chargingProfileKind: 'Absolute',
    transactionId,
    chargingSchedule: [
      {
        id,
        startSchedule: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        chargingRateUnit: 'A',
        chargingSchedulePeriod: [period],
      },
    ],
  };
}
