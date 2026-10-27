import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const listAudit = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?');

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = listAudit.all(limit).map((r) => ({
    id: r.id,
    userEmail: r.user_email,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details ? JSON.parse(r.details) : null,
    createdAt: r.created_at,
  }));
  res.json(rows);
});

export default router;
