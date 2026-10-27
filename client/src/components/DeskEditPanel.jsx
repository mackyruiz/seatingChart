import { useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '../api/client.js';

export default function DeskEditPanel({ desk, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => toForm(desk));
  const [personQuery, setPersonQuery] = useState(desk.person?.name || '');
  const [personResults, setPersonResults] = useState([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef(null);

  useEffect(() => {
    setForm(toForm(desk));
    setPersonQuery(desk.person?.name || '');
    setConfirmingDelete(false);
  }, [desk.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!personQuery.trim()) {
      setPersonResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const { data } = await api.get('/people', { params: { q: personQuery.trim() } });
      setPersonResults(data);
    }, 200);
    return () => clearTimeout(searchTimer.current);
  }, [personQuery]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e?.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave(desk, {
        label: form.label,
        department: form.department || null,
        deskType: form.deskType,
        status: form.status,
        assignedPersonId: form.assignedPersonId,
        width: clampDimension(form.width),
        height: clampDimension(form.height),
        rotation: Number(form.rotation) || 0,
      });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save desk.'));
    } finally {
      setSaving(false);
    }
  }

  async function createAndAssignPerson() {
    setError('');
    try {
      const { data } = await api.post('/people', { name: personQuery.trim(), department: form.department || null });
      set('assignedPersonId', data.id);
      setPersonQuery(data.name);
      setPersonResults([]);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create person.'));
    }
  }

  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        <h2>Edit desk</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <form onSubmit={save} className="desk-edit-form">
        <label>
          Label
          <input value={form.label} onChange={(e) => set('label', e.target.value)} maxLength={80} required />
        </label>

        <label>
          Department
          <input value={form.department} onChange={(e) => set('department', e.target.value)} maxLength={120} />
        </label>

        <label>
          Width × height
          <div className="form-row">
            <input
              type="number"
              min={10}
              max={2000}
              value={form.width}
              onChange={(e) => set('width', e.target.value)}
            />
            <span>×</span>
            <input
              type="number"
              min={10}
              max={2000}
              value={form.height}
              onChange={(e) => set('height', e.target.value)}
            />
          </div>
        </label>

        <label>
          Rotation (degrees)
          <input type="number" value={form.rotation} onChange={(e) => set('rotation', e.target.value)} step={1} />
        </label>

        <label>
          Desk type
          <select value={form.deskType} onChange={(e) => set('deskType', e.target.value)}>
            <option value="standard">Standard</option>
            <option value="standing">Standing desk</option>
            <option value="shared">Shared / hot desk</option>
            <option value="office">Private office</option>
          </select>
        </label>

        <label>
          Status
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="reserved">Reserved</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>

        <label>
          Assigned to
          <div className="person-picker">
            <input
              value={personQuery}
              placeholder="Search people…"
              onChange={(e) => {
                setPersonQuery(e.target.value);
                if (!e.target.value.trim()) set('assignedPersonId', null);
              }}
            />
            {personQuery.trim() && personResults.length > 0 && (
              <ul className="search-results">
                {personResults.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => {
                      set('assignedPersonId', p.id);
                      setPersonQuery(p.name);
                      setPersonResults([]);
                    }}
                  >
                    {p.name} <span className="muted">{p.department}</span>
                  </li>
                ))}
              </ul>
            )}
            {personQuery.trim() &&
              personResults.length === 0 &&
              personQuery.trim() !== desk.person?.name && (
                <button type="button" className="link-button" onClick={createAndAssignPerson}>
                  + Add "{personQuery.trim()}" as a new person
                </button>
              )}
            {form.assignedPersonId && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  set('assignedPersonId', null);
                  setPersonQuery('');
                }}
              >
                Unassign
              </button>
            )}
          </div>
        </label>

        <p className="muted small">
          Type an exact size above for uniformity, or drag the desk / use its corner handles on the canvas
          to size it freely.
        </p>

        {error && <div className="error-text">{error}</div>}

        <div className="row-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!confirmingDelete && (
            <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
          {confirmingDelete && (
            <>
              <span className="muted">Delete this desk?</span>
              <button type="button" className="danger" onClick={() => onDelete(desk)}>
                Confirm delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </form>
    </aside>
  );
}

function toForm(desk) {
  return {
    label: desk.label || '',
    department: desk.department || '',
    deskType: desk.deskType || 'standard',
    status: desk.status || 'active',
    assignedPersonId: desk.assignedPersonId || null,
    width: desk.width,
    height: desk.height,
    rotation: desk.rotation,
  };
}

function clampDimension(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.min(2000, Math.max(10, Math.round(n)));
}
