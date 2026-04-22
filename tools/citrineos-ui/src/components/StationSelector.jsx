import React from 'react';

export default function StationSelector({ stations, value, onChange }) {
  return (
    <div>
      <label>Station</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={!stations.length}
      >
        {!stations.length && <option value="">(no stations)</option>}
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id} {s.isOnline ? '● online' : '○ offline'}
            {s.protocol ? `  ${s.protocol}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
