import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getLatestActiveTransaction,
  listStations,
  requestStartTransaction,
  requestStopTransaction,
} from './api.js';
import StationSelector from './components/StationSelector.jsx';
import StartTransactionModal from './components/StartTransactionModal.jsx';
import BPTControl from './components/BPTControl.jsx';
import PowerProfileGraph from './components/PowerProfileGraph.jsx';

const REFRESH_MS = 3000;

export default function App() {
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState(null);
  const stationIdRef = useRef(null);
  const userPickedRef = useRef(false);
  const [activeTx, setActiveTx] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, level = 'success') => {
    setToast({ msg, level });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listStations();
      setStations(list);

      // Default to first online if user hasn't picked manually.
      let nextId = stationIdRef.current;
      const stillExists = nextId && list.some((s) => s.id === nextId);
      if (!stillExists || !userPickedRef.current) {
        const firstOnline = list.find((s) => s.isOnline);
        nextId = firstOnline?.id || list[0]?.id || null;
        if (nextId !== stationIdRef.current) {
          stationIdRef.current = nextId;
          setStationId(nextId);
        }
      }

      if (nextId) {
        const tx = await getLatestActiveTransaction(nextId).catch(() => null);
        setActiveTx(tx);
      } else {
        setActiveTx(null);
      }
    } catch (err) {
      console.error('refresh failed', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const onStationChange = (id) => {
    userPickedRef.current = true;
    stationIdRef.current = id;
    setStationId(id);
    refresh();
  };

  const onStartSubmit = async (opts) => {
    if (!stationId) return;
    setBusy(true);
    try {
      const result = await requestStartTransaction(stationId, opts);
      const r0 = Array.isArray(result) ? result[0] : result;
      showToast(`RequestStartTransaction → ${r0?.success ? 'sent' : JSON.stringify(r0)}`,
        r0?.success ? 'success' : 'error');
      setShowModal(false);
      setTimeout(refresh, 500);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onStop = async () => {
    if (!stationId || !activeTx) return;
    setBusy(true);
    try {
      const result = await requestStopTransaction(stationId, activeTx.transactionId);
      const r0 = Array.isArray(result) ? result[0] : result;
      showToast(`RequestStopTransaction → ${r0?.success ? 'sent' : JSON.stringify(r0)}`,
        r0?.success ? 'success' : 'error');
      setTimeout(refresh, 500);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const station = stations.find((s) => s.id === stationId);

  return (
    <div className="app">
      <h1>CitrineOS BPT Console</h1>

      <div className="panel">
        <StationSelector stations={stations} value={stationId} onChange={onStationChange} />
        {station && (
          <div className="muted" style={{ marginTop: 8 }}>
            <span className={`status-pill ${station.isOnline ? 'online' : 'offline'}`}>
              {station.isOnline ? 'online' : 'offline'}
            </span>
            <span style={{ marginLeft: 8 }}>
              {station.protocol || '?'} · {station.chargePointVendor || '?'} {station.chargePointModel || ''}
            </span>
          </div>
        )}
      </div>

      <div className="panel">
        {activeTx ? (
          <div className="txn-row">
            <div>
              <div>Active transaction</div>
              <div className="id">{activeTx.transactionId}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {activeTx.chargingState || '?'}
                {activeTx.totalKwh != null ? ` · ${activeTx.totalKwh.toFixed?.(3) ?? activeTx.totalKwh} kWh` : ''}
              </div>
            </div>
            <button className="danger" onClick={onStop} disabled={busy} style={{ width: 'auto' }}>
              Stop
            </button>
          </div>
        ) : (
          <div className="row">
            <div className="muted">No active transaction.</div>
            <button
              onClick={() => setShowModal(true)}
              disabled={!stationId || !station?.isOnline}
              style={{ width: 'auto' }}
            >
              Start Transaction
            </button>
          </div>
        )}
      </div>

      {activeTx && (
        <>
          <div className="panel">
            <BPTControl
              stationId={stationId}
              transactionId={activeTx.transactionId}
              evseId={activeTx.Evse?.evseTypeId}
              onLog={(msg, level) => showToast(msg, level)}
            />
          </div>
          <div className="panel">
            <PowerProfileGraph
              transactionDatabaseId={activeTx.id}
              transactionId={activeTx.transactionId}
            />
          </div>
        </>
      )}

      {showModal && (
        <StartTransactionModal
          onClose={() => setShowModal(false)}
          onSubmit={onStartSubmit}
          busy={busy}
        />
      )}

      {toast && (
        <div className={`toast ${toast.level}`}>{toast.msg}</div>
      )}
    </div>
  );
}
