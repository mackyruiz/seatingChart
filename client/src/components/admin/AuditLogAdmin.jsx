import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

export default function AuditLogAdmin() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get('/audit-log', { params: { limit: 300 } }).then(({ data }) => setRows(data));
  }, []);

  return (
    <div>
      <h2>Audit log</h2>
      <p className="muted">Who changed what, when — most recent first.</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>{r.userEmail || <span className="muted">system</span>}</td>
              <td>{r.action}</td>
              <td>
                {r.entityType}
                {r.entityId ? ` #${r.entityId.slice(0, 8)}` : ''}
              </td>
              <td className="muted small">{r.details ? JSON.stringify(r.details) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
