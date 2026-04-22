import React, { useState } from 'react';

export default function StartTransactionModal({ onClose, onSubmit, busy }) {
  const [idToken, setIdToken] = useState('DEADBEEF');
  const [idTokenType, setIdTokenType] = useState('Central');
  const [evseId, setEvseId] = useState(1);
  const [remoteStartId, setRemoteStartId] = useState(1);
  const [version, setVersion] = useState('2.1');

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      idToken,
      idTokenType,
      evseId: Number(evseId),
      remoteStartId: Number(remoteStartId),
      version,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Start Transaction</h2>

        <div style={{ marginBottom: 12 }}>
          <label>ID Token</label>
          <input value={idToken} onChange={(e) => setIdToken(e.target.value)} required />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>ID Token Type</label>
          <select value={idTokenType} onChange={(e) => setIdTokenType(e.target.value)}>
            <option>Central</option>
            <option>eMAID</option>
            <option>ISO14443</option>
            <option>ISO15693</option>
            <option>Local</option>
          </select>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <label>EVSE ID</label>
            <input
              type="number"
              min={1}
              value={evseId}
              onChange={(e) => setEvseId(e.target.value)}
            />
          </div>
          <div>
            <label>Remote Start ID</label>
            <input
              type="number"
              min={1}
              value={remoteStartId}
              onChange={(e) => setRemoteStartId(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label>OCPP Version</label>
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            <option>2.1</option>
            <option>2.0.1</option>
          </select>
        </div>

        <div className="row">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Starting...' : 'Start'}
          </button>
        </div>
      </form>
    </div>
  );
}
