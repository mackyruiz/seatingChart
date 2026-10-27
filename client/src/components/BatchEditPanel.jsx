import { useEffect, useState } from 'react';

// Shown when 2+ desks are selected (ctrl/cmd-click or shift-click to build a
// selection). Lets Facilities make an existing group of desks uniform in
// size in one action, or delete the whole selection at once.
export default function BatchEditPanel({ desks, onClose, onApplySize, onDeleteSelected }) {
  const first = desks[0];
  const [width, setWidth] = useState(first?.width ?? 60);
  const [height, setHeight] = useState(first?.height ?? 40);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // If the selection's anchor desk changes, re-seed the size fields from it.
  useEffect(() => {
    setWidth(first?.width ?? 60);
    setHeight(first?.height ?? 40);
    setConfirmingDelete(false);
  }, [first?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSameSize = desks.every((d) => d.width === first.width && d.height === first.height);

  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        <h2>{desks.length} desks selected</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <p className="muted small">
        Ctrl/Cmd-click (or Shift-click) desks to build a selection, then batch-edit them here. Copy/Paste
        and Delete also work from the toolbar or keyboard while a selection is active.
      </p>

      {!allSameSize && <p className="muted small">Current sizes differ — set a size below to make them uniform.</p>}

      <div className="desk-edit-form">
        <label>
          Width × height
          <div className="form-row">
            <input type="number" min={10} max={2000} value={width} onChange={(e) => setWidth(clamp(e.target.value))} />
            <span>×</span>
            <input type="number" min={10} max={2000} value={height} onChange={(e) => setHeight(clamp(e.target.value))} />
          </div>
        </label>
        <button type="button" onClick={() => onApplySize(width, height)}>
          Make all {desks.length} desks this size
        </button>

        <div className="row-actions">
          {!confirmingDelete && (
            <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
              Delete {desks.length} desks
            </button>
          )}
          {confirmingDelete && (
            <>
              <span className="muted">Delete {desks.length} desks?</span>
              <button type="button" className="danger" onClick={onDeleteSelected}>
                Confirm delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function clamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.min(2000, Math.max(10, Math.round(n)));
}
