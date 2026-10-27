// Per-floor "last 10 versions" undo (spec §5, Change tracking).
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { listSnapshots, getSnapshot, snapshotFloor } from '../utils/snapshots.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole('admin'), (req, res) => {
  const { floorId } = req.query;
  if (!floorId) return res.status(400).json({ error: 'floorId query param is required.' });
  res.json(
    listSnapshots.all(floorId).map((s) => ({ id: s.id, floorId: s.floor_id, createdBy: s.created_by_email, createdAt: s.created_at }))
  );
});

router.post('/:snapshotId/revert', requireRole('admin'), (req, res) => {
  const snapshot = getSnapshot.get(req.params.snapshotId);
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found.' });

  const desks = JSON.parse(snapshot.snapshot);
  const personExists = db.prepare('SELECT id FROM people WHERE id = ?');
  for (const desk of desks) {
    if (desk.assigned_person_id && !personExists.get(desk.assigned_person_id)) {
      desk.assigned_person_id = null; // referenced person was deleted since this snapshot
    }
  }

  // Snapshot current state first, so reverting is itself undoable.
  snapshotFloor(snapshot.floor_id, req.user);

  const tx = db.prepare('DELETE FROM desks WHERE floor_id = ?');
  const insert = db.prepare(`
    INSERT INTO desks (id, floor_id, x, y, width, height, rotation, label, department, desk_type, assigned_person_id, status, created_at, updated_at)
    VALUES (@id, @floor_id, @x, @y, @width, @height, @rotation, @label, @department, @desk_type, @assigned_person_id, @status, @created_at, @updated_at)
  `);

  db.exec('BEGIN');
  try {
    tx.run(snapshot.floor_id);
    for (const desk of desks) insert.run(desk);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  logAudit({ user: req.user, action: 'revert', entityType: 'floor', entityId: snapshot.floor_id, details: { snapshotId: snapshot.id } });
  res.json({ ok: true, deskCount: desks.length });
});

export default router;
