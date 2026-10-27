import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client.js';

const emptyForm = { name: '', department: '', email: '', slack: '' };

export default function PeopleAdmin() {
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api.get('/people').then(({ data }) => setPeople(data));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.patch(`/people/${editingId}`, form);
      } else {
        await api.post('/people', form);
      }
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function remove(id) {
    if (!confirm('Remove this person from the directory? Any desks assigned to them will become unassigned.')) return;
    await api.delete(`/people/${id}`);
    load();
  }

  return (
    <div>
      <h2>People directory</h2>
      <p className="muted">Used for desk assignment and colleague search. Name/department/contact only.</p>

      <form className="stacked-form" onSubmit={submit}>
        <div className="form-row">
          <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            placeholder="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Slack" value={form.slack} onChange={(e) => setForm({ ...form, slack: e.target.value })} />
          <button type="submit">{editingId ? 'Save' : 'Add person'}</button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      {error && <div className="error-text">{error}</div>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Department</th>
            <th>Email</th>
            <th>Slack</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.department}</td>
              <td>{p.email}</td>
              <td>{p.slack}</td>
              <td>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(p.id);
                    setForm({ name: p.name, department: p.department || '', email: p.email || '', slack: p.slack || '' });
                  }}
                >
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => remove(p.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
