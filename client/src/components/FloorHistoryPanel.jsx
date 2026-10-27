import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api/client.js';

// Simple "last 10 versions" undo for the current floor's desk layout
// (spec §5, Change tracking) — not full git-style history, just enough to
// recover from a bad bulk edit.
export default function FloorHistoryPanel({ floorId, onReverted, onClose }) {
  const [snapshots, setSnapshots] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get('/history', { params: { floorId } }).then(({ data }) => setSnapshots(data));
  }, [floorId]);

  async function revert(id) {
    setError('');
    setBusyId(id);
    try {
      await api.post(`/history/${id}/revert`);
      await onReverted();
      const { data } = await api.get('/history', { params: { floorId } });
      setSnapshots(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not revert.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        <h2>Recent versions</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="muted small">A snapshot is taken automatically before every desk change. Keeps the last 10.</p>
      {error && <div className="error-text">{error}</div>}
      {snapshots.length === 0 && <p className="muted">No changes recorded yet for this floor.</p>}
      <ul className="history-list">
        {snapshots.map((s) => (
          <li key={s.id}>
            <div>
              <div>{new Date(s.createdAt).toLocaleString()}</div>
              <div className="muted small">before edit by {s.createdBy || 'unknown'}</div>
            </div>
            <button type="button" disabled={busyId === s.id} onClick={() => revert(s.id)}>
              {busyId === s.id ? 'Reverting…' : 'Revert to this'}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
