import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody, personSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth);

const searchPeople = db.prepare(`
  SELECT * FROM people
  WHERE name LIKE @q OR department LIKE @q OR email LIKE @q
  ORDER BY name LIMIT 25
`);
const listAllPeople = db.prepare('SELECT * FROM people ORDER BY name');
const getPerson = db.prepare('SELECT * FROM people WHERE id = ?');
const insertPerson = db.prepare('INSERT INTO people (id, name, department, email, slack) VALUES (?, ?, ?, ?, ?)');
const updatePerson = db.prepare('UPDATE people SET name=?, department=?, email=?, slack=? WHERE id=?');
const deletePersonStmt = db.prepare('DELETE FROM people WHERE id=?');

// Directory search used for "find a colleague" and desk assignment. Every
// role that can view the chart can search it; results are name/team/contact
// only (no home address/phone — spec §8 "least sensitive data").
router.get('/', (req, res) => {
  const { q } = req.query;
  if (q && String(q).trim()) {
    res.json(searchPeople.all({ q: `%${String(q).trim()}%` }));
  } else {
    res.json(listAllPeople.all());
  }
});

router.post('/', requireRole('admin'), validateBody(personSchema), (req, res) => {
  const id = randomUUID();
  insertPerson.run(id, req.body.name, req.body.department ?? null, req.body.email ?? null, req.body.slack ?? null);
  logAudit({ user: req.user, action: 'create', entityType: 'person', entityId: id, details: { name: req.body.name } });
  res.status(201).json(getPerson.get(id));
});

router.patch('/:id', requireRole('admin'), validateBody(personSchema), (req, res) => {
  const person = getPerson.get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Person not found.' });
  updatePerson.run(req.body.name, req.body.department ?? null, req.body.email ?? null, req.body.slack ?? null, person.id);
  logAudit({ user: req.user, action: 'update', entityType: 'person', entityId: person.id });
  res.json(getPerson.get(person.id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const person = getPerson.get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Person not found.' });
  deletePersonStmt.run(person.id); // desks.assigned_person_id -> ON DELETE SET NULL
  logAudit({ user: req.user, action: 'delete', entityType: 'person', entityId: person.id, details: { name: person.name } });
  res.json({ ok: true });
});

export default router;
