import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listMeterValues } from '../api.js';

const POLL_MS = 3000;
const NOMINAL_V = 400; // for converting Current samples → kW when Power isn't reported

/** Pull a numeric sample from a SampledValue array matching one of the desired measurands.
 *  Returns null if none match. Applies unitOfMeasure.multiplier (10^n) when present. */
function pickMeasurand(sampledValue, measurands) {
  if (!Array.isArray(sampledValue)) return null;
  for (const sv of sampledValue) {
    if (!sv || typeof sv.value !== 'number') continue;
    if (!measurands.includes(sv.measurand)) continue;
    const mult = sv.unitOfMeasure?.multiplier ?? 0;
    return sv.value * Math.pow(10, mult);
  }
  return null;
}

/** Convert one MeterValue row → signed kW (positive = charging EV, negative = discharging EV).
 *  Tries Power.Active.Import/Export first, falls back to Current.Import * NOMINAL_V. */
function rowToKw(row) {
  const sv = row.sampledValue;
  const pImp = pickMeasurand(sv, ['Power.Active.Import']);
  const pExp = pickMeasurand(sv, ['Power.Active.Export']);
  if (pImp != null || pExp != null) {
    // W → kW. Import is power INTO the EV (charge). Export is power OUT (discharge).
    return ((pImp ?? 0) - (pExp ?? 0)) / 1000;
  }
  const cImp = pickMeasurand(sv, ['Current.Import']);
  const cExp = pickMeasurand(sv, ['Current.Export']);
  if (cImp != null || cExp != null) {
    return (((cImp ?? 0) - (cExp ?? 0)) * NOMINAL_V) / 1000;
  }
  return null;
}

export default function PowerProfileGraph({ transactionDatabaseId, transactionId }) {
  const [points, setPoints] = useState([]); // { tSec: number, kw: number, ts: string }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!transactionDatabaseId) return;
    setLoading(true);
    try {
      const rows = await listMeterValues(transactionDatabaseId, 1000);
      if (!mountedRef.current) return;
      const t0 = rows.length ? new Date(rows[0].timestamp).getTime() : 0;
      const next = rows
        .map((r) => {
          const kw = rowToKw(r);
          if (kw == null) return null;
          const t = new Date(r.timestamp).getTime();
          return { tSec: (t - t0) / 1000, kw, ts: r.timestamp };
        })
        .filter(Boolean);
      setPoints(next);
      setError(null);
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [transactionDatabaseId]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(t);
    };
  }, [refresh]);

  return (
    <div className="power-graph">
      <div className="row" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 500 }}>Power profile</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Net power from MeterValues (Power.Active.Import − Export). Polls every{' '}
            {POLL_MS / 1000}s.
          </div>
        </div>
        <button
          type="button"
          className="secondary grow0"
          onClick={refresh}
          disabled={loading}
          style={{ width: 'auto' }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error ? (
        <div className="muted" style={{ color: 'var(--red)' }}>
          Error loading meter values: {error}
        </div>
      ) : points.length === 0 ? (
        <div className="muted">
          No meter values yet for transaction {transactionId}. The EV needs to send
          MeterValues containing Power.Active.* or Current.* samples.
        </div>
      ) : (
        <Chart points={points} />
      )}
    </div>
  );
}

function Chart({ points }) {
  const W = 760;
  const H = 240;
  const PAD_L = 44;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 24;

  const { xMin, xMax, yMin, yMax, ticksY, polyline, zeroY } = useMemo(() => {
    const xs = points.map((p) => p.tSec);
    const ys = points.map((p) => p.kw);
    const xmin = Math.min(...xs);
    const xmax = Math.max(...xs, xmin + 1);
    let ymin = Math.min(...ys, 0);
    let ymax = Math.max(...ys, 0);
    // Pad y range a touch so flat lines aren't pinned to the edge.
    const span = Math.max(ymax - ymin, 1);
    ymin -= span * 0.1;
    ymax += span * 0.1;

    const xScale = (x) => PAD_L + ((x - xmin) / (xmax - xmin)) * (W - PAD_L - PAD_R);
    const yScale = (y) => PAD_T + ((ymax - y) / (ymax - ymin)) * (H - PAD_T - PAD_B);

    const poly = points.map((p) => `${xScale(p.tSec).toFixed(1)},${yScale(p.kw).toFixed(1)}`).join(' ');
    const zero = yScale(0);

    // Build ~4 nice ticks on Y axis
    const ticks = [];
    const step = niceStep((ymax - ymin) / 4);
    const start = Math.ceil(ymin / step) * step;
    for (let v = start; v <= ymax; v += step) {
      ticks.push({ v, y: yScale(v) });
    }
    return {
      xMin: xmin, xMax: xmax, yMin: ymin, yMax: ymax,
      ticksY: ticks, polyline: poly, zeroY: zero,
    };
  }, [points]);

  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="chart-svg">
        {/* y grid */}
        {ticksY.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y}
              stroke="var(--border)" strokeWidth="1"
            />
            <text x={PAD_L - 6} y={t.y + 3} textAnchor="end" fontSize="10" fill="var(--muted)">
              {t.v.toFixed(1)}
            </text>
          </g>
        ))}
        {/* zero line */}
        <line
          x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY}
          stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3"
        />
        {/* axes */}
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="var(--border)" />
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--border)" />
        {/* axis labels */}
        <text x={PAD_L - 36} y={PAD_T + 8} fontSize="10" fill="var(--muted)">
          kW
        </text>
        <text x={PAD_L} y={H - 4} fontSize="10" fill="var(--muted)">
          0s
        </text>
        <text x={W - PAD_R} y={H - 4} textAnchor="end" fontSize="10" fill="var(--muted)">
          {(xMax - xMin).toFixed(0)}s
        </text>
        {/* line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {points.length} samples · last:{' '}
        <span className={last.kw > 0 ? 'kw-charge' : last.kw < 0 ? 'kw-discharge' : ''}>
          {last.kw >= 0 ? '+' : ''}
          {last.kw.toFixed(2)} kW
        </span>{' '}
        @ {new Date(last.ts).toLocaleTimeString()}
      </div>
    </div>
  );
}

/** Pick a "nice" round step size near the requested raw step. */
function niceStep(raw) {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const norm = raw / base;
  let nice;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  return nice * base;
}
