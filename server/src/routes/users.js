// User/role management — owner only (per spec's role table, "Manage
// users/roles" is the one capability even Facilities/Admin doesn't get).
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { hashPassword } from '../auth/provider.js';
import { validateBody, createUserSchema, updateUserSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth, requireRole('owner'));

const listUsers = db.prepare('SELECT id, email, name, role, archived, created_at FROM users ORDER BY archived, name');
const getUser = db.prepare('SELECT id, email, name, role, archived, created_at FROM users WHERE id = ?');
const emailTaken = db.prepare('SELECT id FROM users WHERE email = ?');
const insertUser = db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)');

router.get('/', (req, res) => {
  res.json(listUsers.all());
});

router.post('/', validateBody(createUserSchema), async (req, res) => {
  if (emailTaken.get(req.body.email)) return res.status(409).json({ error: 'A user with that email already exists.' });
  const id = randomUUID();
  const passwordHash = await hashPassword(req.body.password);
  insertUser.run(id, req.body.email, passwordHash, req.body.name, req.body.role);
  logAudit({ user: req.user, action: 'create', entityType: 'user', entityId: id, details: { email: req.body.email, role: req.body.role } });
  res.status(201).json(getUser.get(id));
});

router.patch('/:id', validateBody(updateUserSchema), (req, res) => {
  const user = getUser.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.id === req.user.id && req.body.role && req.body.role !== 'owner') {
    return res.status(400).json({ error: "You can't demote your own account." });
  }
  const next = {
    name: req.body.name ?? user.name,
    role: req.body.role ?? user.role,
    archived: req.body.archived === undefined ? user.archived : req.body.archived ? 1 : 0,
  };
  db.prepare('UPDATE users SET name=?, role=?, archived=? WHERE id=?').run(next.name, next.role, next.archived, user.id);
  logAudit({ user: req.user, action: 'update', entityType: 'user', entityId: user.id, details: req.body });
  res.json(getUser.get(user.id));
});

export default router;
