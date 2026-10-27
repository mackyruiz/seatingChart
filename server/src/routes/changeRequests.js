// Hiring-manager "request a change" flow (spec §4: managers get
// comment/request rights, not direct edit access).
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody, changeRequestSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth);

const listForFloor = db.prepare(`
  SELECT cr.*, d.label AS desk_label FROM change_requests cr
  LEFT JOIN desks d ON d.id = cr.desk_id
  WHERE cr.floor_id = ? ORDER BY cr.created_at DESC
`);
const insertRequest = db.prepare(
  'INSERT INTO change_requests (id, floor_id, desk_id, requested_by, requested_by_email, message) VALUES (?, ?, ?, ?, ?, ?)'
);
const getRequest = db.prepare('SELECT * FROM change_requests WHERE id = ?');
const resolveRequest = db.prepare("UPDATE change_requests SET status = 'resolved' WHERE id = ?");

router.get('/', (req, res) => {
  const { floorId } = req.query;
  if (!floorId) return res.status(400).json({ error: 'floorId query param is required.' });
  res.json(listForFloor.all(floorId).map(mapRequest));
});

// Any logged-in viewer can leave a request/comment; only admin+ resolves it.
router.post('/', validateBody(changeRequestSchema), (req, res) => {
  const id = randomUUID();
  insertRequest.run(id, req.body.floorId, req.body.deskId ?? null, req.user.id, req.user.email, req.body.message);
  logAudit({ user: req.user, action: 'create', entityType: 'change_request', entityId: id });
  res.status(201).json(mapRequest(getRequest.get(id)));
});

router.post('/:id/resolve', requireRole('admin'), (req, res) => {
  const request = getRequest.get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  resolveRequest.run(request.id);
  logAudit({ user: req.user, action: 'resolve', entityType: 'change_request', entityId: request.id });
  res.json(mapRequest(getRequest.get(request.id)));
});

function mapRequest(row) {
  return {
    id: row.id,
    floorId: row.floor_id,
    deskId: row.desk_id,
    deskLabel: row.desk_label,
    requestedByEmail: row.requested_by_email,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

export default router;
