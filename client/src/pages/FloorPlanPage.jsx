import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api, apiErrorMessage } from '../api/client.js';
import TopBar from '../components/TopBar.jsx';
import FloorCanvas from '../components/FloorCanvas.jsx';
import DeskDetailsPanel from '../components/DeskDetailsPanel.jsx';
import DeskEditPanel from '../components/DeskEditPanel.jsx';
import BatchEditPanel from '../components/BatchEditPanel.jsx';
import FloorHistoryPanel from '../components/FloorHistoryPanel.jsx';

const DEFAULT_DESK_SIZE = { width: 60, height: 40 };
const PASTE_OFFSET = 24;

export default function FloorPlanPage() {
  const { hasRole } = useAuth();

  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [floors, setFloors] = useState([]);
  const [floorId, setFloorId] = useState('');
  const [desks, setDesks] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [placingDesk, setPlacingDesk] = useState(false);
  const [newDeskSize, setNewDeskSize] = useState(DEFAULT_DESK_SIZE);
  const [clipboard, setClipboard] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [centerTarget, setCenterTarget] = useState(null);
  const [highlightedDeskId, setHighlightedDeskId] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [toast, setToast] = useState('');

  const floor = useMemo(() => floors.find((f) => f.id === floorId) || null, [floors, floorId]);
  const selectedDesks = useMemo(() => desks.filter((d) => selectedIds.includes(d.id)), [desks, selectedIds]);
  const singleSelectedDesk = selectedDesks.length === 1 ? selectedDesks[0] : null;
  const departments = useMemo(
    () => [...new Set(desks.map((d) => d.department).filter(Boolean))].sort(),
    [desks]
  );

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // Load sites once.
  useEffect(() => {
    api
      .get('/sites')
      .then(({ data }) => {
        const active = data.filter((s) => !s.archived);
        setSites(active);
        if (active.length) setSiteId(active[0].id);
      })
      .catch((err) => setLoadError(apiErrorMessage(err)));
  }, []);

  // Load floors when site changes.
  useEffect(() => {
    if (!siteId) return;
    api.get('/floors', { params: { siteId } }).then(({ data }) => {
      const active = data.filter((f) => !f.archived);
      setFloors(active);
      setFloorId(active[0]?.id || '');
    });
  }, [siteId]);

  const loadDesks = useCallback(() => {
    if (!floorId) return Promise.resolve();
    return api.get('/desks', { params: { floorId } }).then(({ data }) => setDesks(data));
  }, [floorId]);

  useEffect(() => {
    setSelectedIds([]);
    setClipboard([]);
    loadDesks();
  }, [floorId, loadDesks]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return desks
      .filter((d) => d.label.toLowerCase().includes(q) || d.person?.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [searchQuery, desks]);

  function pickSearchResult(desk) {
    setSelectedIds([desk.id]);
    setCenterTarget({ id: desk.id, nonce: Date.now() }); // nonce forces re-center even if same desk picked twice
    setHighlightedDeskId(desk.id);
    setSearchQuery('');
    setTimeout(() => setHighlightedDeskId((cur) => (cur === desk.id ? null : cur)), 3000);
  }

  // Click a desk to select just it; ctrl/cmd/shift-click toggles it into (or
  // out of) a multi-selection for batch resize/delete/copy.
  function handleSelectDesk(id, additive) {
    if (id === null) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  async function handleMoveDesk(desk, pos) {
    setDesks((prev) => prev.map((d) => (d.id === desk.id ? { ...d, ...pos } : d)));
    try {
      await api.patch(`/desks/${desk.id}`, pos);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not move desk — reloading.'));
      loadDesks();
    }
  }

  async function handleTransformDesk(desk, changes) {
    setDesks((prev) => prev.map((d) => (d.id === desk.id ? { ...d, ...changes } : d)));
    try {
      await api.patch(`/desks/${desk.id}`, changes);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not resize desk — reloading.'));
      loadDesks();
    }
  }

  async function handleSaveDesk(desk, changes) {
    const { data } = await api.patch(`/desks/${desk.id}`, changes);
    setDesks((prev) => prev.map((d) => (d.id === desk.id ? data : d)));
    showToast('Desk saved.');
  }

  async function handleDeleteDesk(desk) {
    await api.delete(`/desks/${desk.id}`);
    setDesks((prev) => prev.filter((d) => d.id !== desk.id));
    setSelectedIds((prev) => prev.filter((id) => id !== desk.id));
    showToast('Desk deleted.');
  }

  async function handleDeleteSelected() {
    const ids = selectedIds;
    if (!ids.length) return;
    try {
      await api.delete('/desks/batch', { data: { ids } });
      setDesks((prev) => prev.filter((d) => !ids.includes(d.id)));
      setSelectedIds([]);
      showToast(`Deleted ${ids.length} desk${ids.length > 1 ? 's' : ''}.`);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete desks.'));
      loadDesks();
    }
  }

  // Batch resize — the "make these desks all the same size" flow.
  async function handleApplySizeToSelection(width, height) {
    const ids = selectedIds;
    if (!ids.length) return;
    setDesks((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, width, height } : d)));
    try {
      const { data } = await api.patch('/desks/batch', { ids, changes: { width, height } });
      setDesks((prev) => prev.map((d) => data.find((u) => u.id === d.id) || d));
      showToast(`Resized ${data.length} desk${data.length > 1 ? 's' : ''} to ${width}×${height}.`);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not resize desks.'));
      loadDesks();
    }
  }

  function handlePlaceDesk(pos) {
    return createDesk({
      x: Math.round(pos.x - newDeskSize.width / 2),
      y: Math.round(pos.y - newDeskSize.height / 2),
      width: newDeskSize.width,
      height: newDeskSize.height,
      label: `Desk ${desks.length + 1}`,
    });
  }

  async function createDesk(fields) {
    try {
      const { data } = await api.post('/desks', { floorId, ...fields });
      setDesks((prev) => [...prev, data]);
      setSelectedIds([data.id]);
      setPlacingDesk(false);
      showToast('Desk added — fill in details on the right.');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not add desk.'));
    }
  }

  // Copy/paste a selection (toolbar buttons + Ctrl/Cmd-C / Ctrl/Cmd-V). A
  // pasted desk keeps its shape/department/type but not its person — two
  // desks silently claiming the same occupant would be confusing.
  function copySelection() {
    if (!selectedDesks.length) return;
    setClipboard(
      selectedDesks.map((d) => ({
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
        rotation: d.rotation,
        label: d.label ? `${d.label} copy` : '',
        department: d.department,
        deskType: d.deskType,
        status: d.status,
      }))
    );
    showToast(`Copied ${selectedDesks.length} desk${selectedDesks.length > 1 ? 's' : ''}.`);
  }

  async function pasteClipboard() {
    if (!clipboard.length || !floorId) return;
    const payload = clipboard.map((d) => ({ ...d, x: d.x + PASTE_OFFSET, y: d.y + PASTE_OFFSET }));
    try {
      const { data } = await api.post('/desks/batch', { floorId, desks: payload });
      setDesks((prev) => [...prev, ...data]);
      setSelectedIds(data.map((d) => d.id));
      showToast(`Pasted ${data.length} desk${data.length > 1 ? 's' : ''}.`);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not paste desks.'));
    }
  }

  // Keyboard shortcuts while editing: Ctrl/Cmd+C copy, Ctrl/Cmd+V paste,
  // Delete/Backspace removes the current selection. Ignored while typing in
  // a form field so it doesn't fight normal text editing.
  useEffect(() => {
    if (!editMode) return;
    function onKeyDown(e) {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboard();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        if (window.confirm(`Delete ${selectedIds.length} desk${selectedIds.length > 1 ? 's' : ''}?`)) {
          handleDeleteSelected();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }); // no deps: always re-bind with the latest closures (selection/clipboard change often)

  async function handleRequestChange(desk, message) {
    await api.post('/change-requests', { floorId, deskId: desk.id, message });
  }

  function handleExport(format) {
    const url = `/api/export/${format}?floorId=${encodeURIComponent(floorId)}`;
    window.open(url, '_blank');
  }

  if (loadError) return <div className="centered-message error-text">{loadError}</div>;
  if (!sites.length) {
    return (
      <div className="centered-message">
        No sites configured yet. {hasRole('admin') ? 'Add one from the Admin page.' : 'Ask an admin to add one.'}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        sites={sites}
        siteId={siteId}
        onSiteChange={setSiteId}
        floors={floors}
        floorId={floorId}
        onFloorChange={setFloorId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        onPickSearchResult={pickSearchResult}
        departments={departments}
        departmentFilter={departmentFilter}
        onDepartmentFilterChange={setDepartmentFilter}
        editMode={editMode}
        onToggleEditMode={() => {
          setEditMode((v) => !v);
          setSelectedIds([]);
          setPlacingDesk(false);
        }}
        onExport={handleExport}
      />

      <div className="main-area">
        {editMode && (
          <div className="edit-toolbar">
            <button type="button" onClick={() => setPlacingDesk((v) => !v)} className={placingDesk ? 'toggle-on' : ''}>
              {placingDesk ? 'Cancel add desk' : '+ Add desk'}
            </button>
            <label className="size-control small">
              size
              <input
                type="number"
                min={10}
                max={2000}
                value={newDeskSize.width}
                onChange={(e) => setNewDeskSize((s) => ({ ...s, width: clampSize(e.target.value) }))}
                title="New desk width"
              />
              <span>×</span>
              <input
                type="number"
                min={10}
                max={2000}
                value={newDeskSize.height}
                onChange={(e) => setNewDeskSize((s) => ({ ...s, height: clampSize(e.target.value) }))}
                title="New desk height"
              />
            </label>
            <span className="toolbar-divider" />
            <button type="button" disabled={!selectedIds.length} onClick={copySelection} title="Ctrl/Cmd+C">
              Copy{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
            </button>
            <button type="button" disabled={!clipboard.length} onClick={pasteClipboard} title="Ctrl/Cmd+V">
              Paste{clipboard.length ? ` (${clipboard.length})` : ''}
            </button>
            <span className="toolbar-divider" />
            <button type="button" onClick={() => setShowHistory((v) => !v)}>
              History / undo
            </button>
          </div>
        )}

        {floor ? (
          <FloorCanvas
            floor={floor}
            desks={desks}
            selectedIds={selectedIds}
            highlightedDeskId={highlightedDeskId}
            departmentFilter={departmentFilter}
            editable={editMode}
            placingDesk={placingDesk}
            onSelectDesk={handleSelectDesk}
            onMoveDesk={handleMoveDesk}
            onTransformDesk={handleTransformDesk}
            onPlaceDesk={handlePlaceDesk}
            centerTarget={centerTarget}
          />
        ) : (
          <div className="centered-message">
            No floors for this site yet. {hasRole('admin') ? 'Add one from the Admin page.' : ''}
          </div>
        )}

        {showHistory && floorId && (
          <FloorHistoryPanel floorId={floorId} onReverted={loadDesks} onClose={() => setShowHistory(false)} />
        )}

        {!showHistory && editMode && selectedDesks.length > 1 && (
          <BatchEditPanel
            desks={selectedDesks}
            onClose={() => setSelectedIds([])}
            onApplySize={handleApplySizeToSelection}
            onDeleteSelected={handleDeleteSelected}
          />
        )}

        {!showHistory && editMode && singleSelectedDesk && (
          <DeskEditPanel
            key={singleSelectedDesk.id}
            desk={singleSelectedDesk}
            onClose={() => setSelectedIds([])}
            onSave={handleSaveDesk}
            onDelete={handleDeleteDesk}
          />
        )}

        {!showHistory && !editMode && singleSelectedDesk && (
          <DeskDetailsPanel desk={singleSelectedDesk} onClose={() => setSelectedIds([])} onRequestChange={handleRequestChange} />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function clampSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.min(2000, Math.max(10, Math.round(n)));
}
