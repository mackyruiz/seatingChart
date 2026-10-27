import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import SitesFloorsAdmin from '../components/admin/SitesFloorsAdmin.jsx';
import PeopleAdmin from '../components/admin/PeopleAdmin.jsx';
import UsersAdmin from '../components/admin/UsersAdmin.jsx';
import AuditLogAdmin from '../components/admin/AuditLogAdmin.jsx';

const TABS = [
  { id: 'sites', label: 'Sites & Floors', minRole: 'admin' },
  { id: 'people', label: 'People directory', minRole: 'admin' },
  { id: 'users', label: 'Users & roles', minRole: 'owner' },
  { id: 'audit', label: 'Audit log', minRole: 'admin' },
];

export default function AdminPage() {
  const { hasRole } = useAuth();
  const visibleTabs = TABS.filter((t) => hasRole(t.minRole));
  const [tab, setTab] = useState(visibleTabs[0]?.id);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-brand">Seating Chart — Admin</div>
        <div className="top-bar-spacer" />
        <Link to="/">← Back to floor plan</Link>
      </header>

      <div className="admin-layout">
        <nav className="admin-tabs">
          {visibleTabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'toggle-on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="admin-content">
          {tab === 'sites' && <SitesFloorsAdmin />}
          {tab === 'people' && <PeopleAdmin />}
          {tab === 'users' && <UsersAdmin />}
          {tab === 'audit' && <AuditLogAdmin />}
        </div>
      </div>
    </div>
  );
}
