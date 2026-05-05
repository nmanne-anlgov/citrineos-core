import React, { useEffect, useRef, useState } from 'react';
import {
  buildDynamicProfile,
  buildScheduleProfile,
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

const DEFAULT_SCHEDULE = [
  { startPeriod: 0, setpoint: 30 },
  { startPeriod: 60, setpoint: -30 },
  { startPeriod: 120, setpoint: 0 },
];

export default function BPTControl({ stationId, transactionId, evseId, onLog }) {
  const [mode, setMode] = useState('setpoint'); // 'setpoint' | 'schedule'
  const [setpoint, setSetpoint] = useState(0);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
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

  const sendSetpointUpdate = async (valueA) => {
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

  const sendSchedule = async () => {
    if (inFlight.current) return;
    if (!schedule.length) {
      onLog?.('Schedule is empty.', 'error');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      // SetChargingProfile requires fresh id+stackLevel each time so the new schedule wins.
      const next = await getNextProfileIdAndStack(stationId);
      const profile = buildScheduleProfile({
        id: next.id,
        stackLevel: next.stackLevel,
        transactionId,
        periods: schedule,
        maxCharge: MAX_CHARGE_A,
        maxDischarge: MAX_DISCHARGE_A,
      });
      const result = await setChargingProfile(stationId, evseId ?? 1, profile, '2.1');
      const r0 = Array.isArray(result) ? result[0] : result;
      onLog?.(
        `SetChargingProfile (schedule, ${schedule.length} periods, id=${next.id}) → ${JSON.stringify(r0)}`,
        r0?.success === false ? 'error' : 'success',
      );
      if (r0 && r0.success !== false) setProfileId(next.id);
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
    debounceRef.current = setTimeout(() => sendSetpointUpdate(value), DEBOUNCE_MS);
  };

  return (
    <div className="bpt-control">
      <div className="tabs">
        <button
          className={`tab ${mode === 'setpoint' ? 'active' : ''}`}
          onClick={() => setMode('setpoint')}
          type="button"
        >
          Setpoint
        </button>
        <button
          className={`tab ${mode === 'schedule' ? 'active' : ''}`}
          onClick={() => setMode('schedule')}
          type="button"
        >
          Schedule
        </button>
      </div>

      {mode === 'setpoint' ? (
        <SetpointPanel
          setpoint={setpoint}
          ready={ready}
          busy={busy}
          profileId={profileId}
          onSliderChange={onSliderChange}
          onStop={() => {
            setSetpoint(0);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            sendSetpointUpdate(0);
          }}
        />
      ) : (
        <SchedulePanel
          schedule={schedule}
          setSchedule={setSchedule}
          ready={ready}
          busy={busy}
          onApply={sendSchedule}
        />
      )}
    </div>
  );
}

function SetpointPanel({ setpoint, ready, busy, profileId, onSliderChange, onStop }) {
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
          onClick={onStop}
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

function SchedulePanel({ schedule, setSchedule, ready, busy, onApply }) {
  const updateRow = (idx, patch) => {
    setSchedule((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx) => {
    setSchedule((rows) => rows.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    setSchedule((rows) => {
      const last = rows[rows.length - 1];
      const nextStart = last ? Math.max(0, last.startPeriod) + 60 : 0;
      return [...rows, { startPeriod: nextStart, setpoint: 0 }];
    });
  };
  const reset = () => setSchedule(DEFAULT_SCHEDULE);

  const sorted = schedule.slice().sort((a, b) => a.startPeriod - b.startPeriod);
  const total = sorted.length ? sorted[sorted.length - 1].startPeriod : 0;

  return (
    <div className="schedule-wrap">
      <div className="muted" style={{ marginBottom: 8 }}>
        Each period takes effect at <span className="mono">startPeriod</span> seconds after the
        schedule is sent and runs until the next period. Setpoint in Amperes (positive = charge,
        negative = discharge).
      </div>

      <SchedulePreview periods={sorted} maxAbs={MAX_CHARGE_A} />

      <div className="schedule-table">
        <div className="schedule-header">
          <span>#</span>
          <span>Start (s)</span>
          <span>Setpoint (A)</span>
          <span>≈ kW</span>
          <span></span>
        </div>
        {schedule.map((row, idx) => (
          <div className="schedule-row" key={idx}>
            <span className="muted">{idx + 1}</span>
            <input
              type="number"
              min={0}
              step={1}
              value={row.startPeriod}
              onChange={(e) => updateRow(idx, { startPeriod: Number(e.target.value) })}
            />
            <input
              type="number"
              min={-MAX_DISCHARGE_A}
              max={MAX_CHARGE_A}
              step={STEP_A}
              value={row.setpoint}
              onChange={(e) => updateRow(idx, { setpoint: Number(e.target.value) })}
            />
            <span className="muted mono">
              {((row.setpoint * NOMINAL_V) / 1000).toFixed(1)}
            </span>
            <button
              type="button"
              className="secondary grow0"
              style={{ width: 'auto' }}
              onClick={() => removeRow(idx)}
              disabled={schedule.length <= 1}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="secondary" onClick={addRow} style={{ width: 'auto' }}>
          + Add period
        </button>
        <button type="button" className="secondary" onClick={reset} style={{ width: 'auto' }}>
          Reset
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onApply}
          disabled={!ready || busy || !schedule.length}
          style={{ width: 'auto' }}
        >
          {busy ? 'Sending…' : `Apply schedule (${schedule.length} periods, ~${total}s)`}
        </button>
      </div>

      <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
        Apply sends a fresh <span className="mono">SetChargingProfile</span> with these periods at
        a higher stackLevel so it supersedes any prior profile. Subsequent setpoint slider use
        will start from this new profile.
      </div>
    </div>
  );
}

function SchedulePreview({ periods, maxAbs }) {
  if (!periods.length) return null;
  const W = 600;
  const H = 80;
  const PAD = 4;
  const total = Math.max(periods[periods.length - 1].startPeriod + 60, 60);

  // Build rectangles per period: from this start to the next start (or +60s for last).
  const rects = periods.map((p, i) => {
    const next = periods[i + 1];
    const end = next ? next.startPeriod : total;
    const x = PAD + ((p.startPeriod / total) * (W - 2 * PAD));
    const w = Math.max(1, ((end - p.startPeriod) / total) * (W - 2 * PAD));
    const mid = H / 2;
    const yScale = (H / 2 - PAD) / maxAbs;
    const y = mid - p.setpoint * yScale;
    const h = Math.abs(p.setpoint * yScale);
    const fill = p.setpoint > 0 ? 'var(--green)' : p.setpoint < 0 ? 'var(--yellow)' : 'var(--muted)';
    const rectY = p.setpoint >= 0 ? y : mid;
    return { x, y: rectY, w, h, fill, key: i };
  });

  return (
    <div className="schedule-preview">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="var(--border)" strokeWidth="1" />
        {rects.map((r) => (
          <rect key={r.key} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} opacity="0.7" />
        ))}
      </svg>
      <div className="slider-marks">
        <span>0s</span>
        <span>{Math.round(total / 2)}s</span>
        <span>{total}s</span>
      </div>
    </div>
  );
}
