import { useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client.js';

export default function SitesFloorsAdmin() {
  const [sites, setSites] = useState([]);
  const [floorsBySite, setFloorsBySite] = useState({});
  const [newSiteName, setNewSiteName] = useState('');
  const [newFloorName, setNewFloorName] = useState({});
  const [error, setError] = useState('');
  const fileInputs = useRef({});

  async function loadAll() {
    const { data } = await api.get('/sites');
    setSites(data);
    const entries = await Promise.all(
      data.map(async (s) => {
        const { data: floors } = await api.get('/floors', { params: { siteId: s.id } });
        return [s.id, floors];
      })
    );
    setFloorsBySite(Object.fromEntries(entries));
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function run(fn) {
    setError('');
    try {
      await fn();
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <h2>Sites & floors</h2>
      <p className="muted">
        Add a site (building) and at least one floor for it. New sites appear in the picker immediately — no
        deploy needed.
      </p>
      {error && <div className="error-text">{error}</div>}

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newSiteName.trim()) return;
          run(async () => {
            await api.post('/sites', { name: newSiteName.trim() });
            setNewSiteName('');
          });
        }}
      >
        <input placeholder="New site name" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} />
        <button type="submit">Add site</button>
      </form>

      {sites.map((site) => (
        <section key={site.id} className="admin-card">
          <div className="admin-card-header">
            <EditableName
              value={site.name}
              onSave={(name) => run(() => api.patch(`/sites/${site.id}`, { name }))}
            />
            <span className={`badge ${site.archived ? 'archived' : 'active'}`}>
              {site.archived ? 'Archived' : 'Active'}
            </span>
            <button
              type="button"
              onClick={() => run(() => api.post(`/sites/${site.id}/${site.archived ? 'unarchive' : 'archive'}`))}
            >
              {site.archived ? 'Unarchive' : 'Archive'}
            </button>
          </div>

          <ul className="floor-list">
            {(floorsBySite[site.id] || []).map((floor) => (
              <li key={floor.id}>
                <EditableName value={floor.name} onSave={(name) => run(() => api.patch(`/floors/${floor.id}`, { name }))} />
                <span className={`badge ${floor.archived ? 'archived' : 'active'}`}>
                  {floor.archived ? 'Archived' : 'Active'}
                </span>
                {floor.backgroundImage ? (
                  <img src={floor.backgroundImage} alt="" className="floor-thumb" />
                ) : (
                  <span className="muted small">No background image</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  ref={(el) => (fileInputs.current[floor.id] = el)}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('image', file);
                    run(() => api.post(`/floors/${floor.id}/background`, formData));
                    e.target.value = '';
                  }}
                />
                <button type="button" onClick={() => fileInputs.current[floor.id]?.click()}>
                  Upload background
                </button>
                <button
                  type="button"
                  onClick={() => run(() => api.post(`/floors/${floor.id}/${floor.archived ? 'unarchive' : 'archive'}`))}
                >
                  {floor.archived ? 'Unarchive' : 'Archive'}
                </button>
              </li>
            ))}
          </ul>

          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = (newFloorName[site.id] || '').trim();
              if (!name) return;
              run(async () => {
                await api.post('/floors', { siteId: site.id, name });
                setNewFloorName((f) => ({ ...f, [site.id]: '' }));
              });
            }}
          >
            <input
              placeholder="New floor name"
              value={newFloorName[site.id] || ''}
              onChange={(e) => setNewFloorName((f) => ({ ...f, [site.id]: e.target.value }))}
            />
            <button type="submit">Add floor</button>
          </form>
        </section>
      ))}
    </div>
  );
}

function EditableName({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span className="editable-name" onClick={() => setEditing(true)} title="Click to rename">
        {value}
      </span>
    );
  }

  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        setEditing(false);
        if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
      }}
    >
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setEditing(false)} />
    </form>
  );
}
