import React, { useEffect, useRef, useState } from 'react';
import {
  buildDynamicProfile,
  getNextProfileIdAndStack,
  setChargingProfile,
  updateDynamicSchedule,
} from '../api.js';

const DEBOUNCE_MS = 300;
// Use Amperes everywhere. libocpp's W↔A conversion uses the EV's negotiated nominal voltage,
// which makes W setpoints scale unpredictably (e.g., -2500 W requested came out as -1449 W
// because libocpp cached an inflated W reference from an earlier UpdateDynamicSchedule).
// With chargingRateUnit='A' the value passes through unchanged.
const MAX_CHARGE_A = 100; // upper bound on slider; EV-reported v2xChargingParameters.maxChargeCurrent is 200
const MAX_DISCHARGE_A = 100; // upper bound on slider; EV-reported v2xChargingParameters.maxDischargeCurrent is -200
const STEP_A = 0.5;
const NOMINAL_V = 400; // for the kW estimate displayed under the slider

export default function BPTSlider({ stationId, transactionId, evseId, onLog }) {
  const [setpoint, setSetpoint] = useState(0);
  const [profileId, setProfileId] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);
  const inFlight = useRef(false);

  // On mount, ALWAYS establish a fresh A-based dynamic profile. We can't change the
  // chargingRateUnit of an existing profile via UpdateDynamicSchedule, and any
  // pre-existing W-based profile has the libocpp scaling issue. A fresh profile with
  // a higher stackLevel takes precedence at the charger.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      try {
        const next = await getNextProfileIdAndStack(stationId);
        const profile = buildDynamicProfile({
          id: next.id,
          stackLevel: next.stackLevel,
          transactionId,
          setpoint: 0,
          maxCharge: MAX_CHARGE_A,
          maxDischarge: MAX_DISCHARGE_A,
        });
        const result = await setChargingProfile(stationId, evseId ?? 1, profile, '2.1');
        const r0 = Array.isArray(result) ? result[0] : result;
        if (cancelled) return;
        if (r0 && r0.success === false) {
          onLog?.(`SetChargingProfile failed: ${JSON.stringify(r0)}`, 'error');
          return;
        }
        setProfileId(next.id);
        setReady(true);
        onLog?.(`Established A-based profile id=${next.id} (±${MAX_CHARGE_A} A)`);
      } catch (e) {
        if (!cancelled) onLog?.(`Setup error: ${e.message}`, 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stationId, transactionId, evseId]);

  const sendUpdate = async (valueA) => {
    if (inFlight.current || !profileId) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await updateDynamicSchedule(stationId, profileId, { setpoint: valueA }, '2.1');
      const r0 = Array.isArray(result) ? result[0] : result;
      onLog?.(`UpdateDynamicSchedule @${valueA} A → ${JSON.stringify(r0)}`);
      if (r0 && r0.success === false) setProfileId(null);
    } catch (err) {
      onLog?.(`Error: ${err.message}`, 'error');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const onSliderChange = (e) => {
    const value = Number(e.target.value);
    setSetpoint(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sendUpdate(value), DEBOUNCE_MS);
  };

  const cls = setpoint > 0 ? 'charge' : setpoint < 0 ? 'discharge' : 'zero';
  const label = setpoint > 0 ? 'CHARGING' : setpoint < 0 ? 'DISCHARGING' : 'IDLE';
  const kwEstimate = (setpoint * NOMINAL_V) / 1000;

  return (
    <div className="slider-wrap">
      <div className="slider-value">
        <div>
          <div className={`big ${cls}`}>
            {setpoint > 0 ? '+' : ''}
            {setpoint.toFixed(1)} A
          </div>
          <div className="muted">
            {label}
            {busy ? ' · sending…' : ''} · ≈ {kwEstimate >= 0 ? '+' : ''}
            {kwEstimate.toFixed(1)} kW (@ {NOMINAL_V} V)
          </div>
        </div>
        <button
          className="secondary grow0"
          style={{ width: 'auto' }}
          onClick={() => {
            setSetpoint(0);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            sendUpdate(0);
          }}
          disabled={!ready}
        >
          Stop flow
        </button>
      </div>
      <input
        type="range"
        min={-MAX_DISCHARGE_A}
        max={MAX_CHARGE_A}
        step={STEP_A}
        value={setpoint}
        onChange={onSliderChange}
        disabled={!ready}
      />
      <div className="slider-marks">
        <span>-{MAX_DISCHARGE_A} A (discharge)</span>
        <span>0</span>
        <span>+{MAX_CHARGE_A} A (charge)</span>
      </div>
      <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
        {ready
          ? `Profile id ${profileId} (chargingRateUnit=A) — slider sends UpdateDynamicSchedule (debounced ${DEBOUNCE_MS}ms)`
          : 'Establishing fresh A-based dynamic profile...'}
      </div>
    </div>
  );
}
