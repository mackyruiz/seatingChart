import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api, apiErrorMessage } from '../../api/client.js';

const ROLES = ['employee', 'manager', 'admin', 'owner'];
const emptyForm = { email: '', password: '', name: '', role: 'employee' };

// Owner-only: add/remove admins and change roles without a code change
// (spec §9). This is also the seam where SAML/JIT-provisioned accounts will
// show up once that's wired in — they land in this same table.
export default function UsersAdmin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function load() {
    api.get('/users').then(({ data }) => setUsers(data));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', form);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function updateUser(id, changes) {
    setError('');
    try {
      await api.patch(`/users/${id}`, changes);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <h2>Users & roles</h2>
      <p className="muted">
        Roles are enforced on the server for every request, not just hidden in the UI. Password login is v1;
        this is the account table SAML/JIT provisioning would also populate.
      </p>

      <form className="stacked-form" onSubmit={submit}>
        <div className="form-row">
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            type="password"
            placeholder="Temporary password (min 8 chars)"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit">Add user</button>
        </div>
      </form>
      {error && <div className="error-text">{error}</div>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select
                  value={u.role}
                  disabled={u.id === me.id}
                  onChange={(e) => updateUser(u.id, { role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td>{u.archived ? 'Archived' : 'Active'}</td>
              <td>
                <button type="button" disabled={u.id === me.id} onClick={() => updateUser(u.id, { archived: !u.archived })}>
                  {u.archived ? 'Unarchive' : 'Archive'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
