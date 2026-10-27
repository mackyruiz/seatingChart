import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function DeskDetailsPanel({ desk, onClose, onRequestChange }) {
  const { hasRole } = useAuth();
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  if (!desk) return null;

  async function submitRequest(e) {
    e.preventDefault();
    await onRequestChange(desk, message);
    setSent(true);
    setMessage('');
  }

  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        <h2>{desk.label || 'Desk'}</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <dl className="desk-fact-list">
        <dt>Occupant</dt>
        <dd>{desk.person ? desk.person.name : <span className="muted">Unassigned</span>}</dd>
        <dt>Department</dt>
        <dd>{desk.department || <span className="muted">—</span>}</dd>
        <dt>Desk type</dt>
        <dd>{desk.deskType}</dd>
        <dt>Status</dt>
        <dd>{desk.status}</dd>
        {desk.person?.email && (
          <>
            <dt>Email</dt>
            <dd>{desk.person.email}</dd>
          </>
        )}
        {desk.person?.slack && (
          <>
            <dt>Slack</dt>
            <dd>{desk.person.slack}</dd>
          </>
        )}
      </dl>

      {hasRole('manager') && !hasRole('admin') && (
        <div className="change-request-box">
          {!requesting && !sent && (
            <button type="button" onClick={() => setRequesting(true)}>
              Request a change
            </button>
          )}
          {requesting && !sent && (
            <form onSubmit={submitRequest}>
              <textarea
                placeholder="Describe the change you'd like (e.g. reassign this desk to a new hire)…"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
              <div className="row-actions">
                <button type="submit">Send request</button>
                <button type="button" onClick={() => setRequesting(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {sent && <p className="muted">Request sent to Facilities.</p>}
        </div>
      )}
    </aside>
  );
}
