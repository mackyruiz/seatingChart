import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function TopBar({
  sites,
  siteId,
  onSiteChange,
  floors,
  floorId,
  onFloorChange,
  searchQuery,
  onSearchChange,
  searchResults,
  onPickSearchResult,
  departments,
  departmentFilter,
  onDepartmentFilterChange,
  editMode,
  onToggleEditMode,
  onExport,
}) {
  const { user, hasRole, logout } = useAuth();

  return (
    <header className="top-bar">
      <div className="top-bar-brand">Seating Chart</div>

      <select value={siteId || ''} onChange={(e) => onSiteChange(e.target.value)} aria-label="Site">
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select value={floorId || ''} onChange={(e) => onFloorChange(e.target.value)} aria-label="Floor">
        {floors.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <div className="search-box">
        <input
          type="search"
          placeholder="Search by name or desk…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery.trim() && searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((r) => (
              <li key={r.id} onClick={() => onPickSearchResult(r)}>
                <strong>{r.label}</strong>
                {r.person && <span className="muted"> — {r.person.name}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <select
        value={departmentFilter}
        onChange={(e) => onDepartmentFilterChange(e.target.value)}
        aria-label="Filter by department"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <div className="top-bar-spacer" />

      <div className="export-menu">
        <button type="button" onClick={() => onExport('csv')}>
          Export CSV
        </button>
        <button type="button" onClick={() => onExport('json')}>
          Export JSON
        </button>
      </div>

      {hasRole('admin') && (
        <button type="button" className={editMode ? 'toggle-on' : ''} onClick={onToggleEditMode}>
          {editMode ? 'Editing' : 'Edit floor'}
        </button>
      )}

      {hasRole('admin') && <Link to="/admin">Admin</Link>}

      <div className="user-menu">
        <span className="muted">
          {user?.name} ({user?.role})
        </span>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
