import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import {
  validateBody,
  deskCreateSchema,
  deskUpdateSchema,
  deskBatchUpdateSchema,
  deskBatchCreateSchema,
  deskBatchDeleteSchema,
} from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';
import { snapshotFloor } from '../utils/snapshots.js';

const router = Router();
router.use(requireAuth);

const listDesksForFloor = db.prepare(`
  SELECT d.*, p.name AS person_name, p.department AS person_department, p.email AS person_email, p.slack AS person_slack
  FROM desks d LEFT JOIN people p ON p.id = d.assigned_person_id
  WHERE d.floor_id = ?
  ORDER BY d.created_at
`);
const getDeskWithPerson = db.prepare(`
  SELECT d.*, p.name AS person_name, p.department AS person_department, p.email AS person_email, p.slack AS person_slack
  FROM desks d LEFT JOIN people p ON p.id = d.assigned_person_id
  WHERE d.id = ?
`);
const getDeskRow = db.prepare('SELECT * FROM desks WHERE id = ?');
const getFloorRow = db.prepare('SELECT * FROM floors WHERE id = ?');
const personExists = db.prepare('SELECT id FROM people WHERE id = ?');

const insertDesk = db.prepare(`
  INSERT INTO desks (id, floor_id, x, y, width, height, rotation, label, department, desk_type, assigned_person_id, status)
  VALUES (@id, @floorId, @x, @y, @width, @height, @rotation, @label, @department, @deskType, @assignedPersonId, @status)
`);
const updateDeskStmt = db.prepare(`
  UPDATE desks SET x=@x, y=@y, width=@width, height=@height, rotation=@rotation, label=@label,
    department=@department, desk_type=@deskType, assigned_person_id=@assignedPersonId, status=@status,
    updated_at = datetime('now')
  WHERE id=@id
`);
const deleteDeskStmt = db.prepare('DELETE FROM desks WHERE id = ?');

router.get('/', (req, res) => {
  const { floorId } = req.query;
  if (!floorId) return res.status(400).json({ error: 'floorId query param is required.' });
  res.json(listDesksForFloor.all(floorId).map(mapDesk));
});

router.post('/', requireRole('admin'), validateBody(deskCreateSchema), (req, res) => {
  const floor = getFloorRow.get(req.body.floorId);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  if (req.body.assignedPersonId && !personExists.get(req.body.assignedPersonId)) {
    return res.status(400).json({ error: 'assignedPersonId does not reference a known person.' });
  }
  snapshotFloor(floor.id, req.user);
  const id = randomUUID();
  insertDesk.run({
    id,
    floorId: req.body.floorId,
    x: req.body.x,
    y: req.body.y,
    width: req.body.width,
    height: req.body.height,
    rotation: req.body.rotation,
    label: req.body.label,
    department: req.body.department ?? null,
    deskType: req.body.deskType,
    assignedPersonId: req.body.assignedPersonId ?? null,
    status: req.body.status,
  });
  logAudit({ user: req.user, action: 'create', entityType: 'desk', entityId: id, details: { floorId: floor.id, label: req.body.label } });
  res.status(201).json(mapDesk(getDeskWithPerson.get(id)));
});

// --- Batch operations ------------------------------------------------------
// Registered before "/:id" so "batch" is never matched as an :id param.
// Used for: pasting a copied selection (batch create), making a selection of
// desks uniform in size/other fields (batch update), and deleting a
// multi-select in one action (batch delete). Each takes exactly one
// before-snapshot per affected floor (not one per desk) so a single undo
// step reverts the whole batch.

router.post('/batch', requireRole('admin'), validateBody(deskBatchCreateSchema), (req, res) => {
  const floor = getFloorRow.get(req.body.floorId);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  for (const d of req.body.desks) {
    if (d.assignedPersonId && !personExists.get(d.assignedPersonId)) {
      return res.status(400).json({ error: 'assignedPersonId does not reference a known person.' });
    }
  }

  snapshotFloor(floor.id, req.user);
  const created = req.body.desks.map((d) => {
    const id = randomUUID();
    insertDesk.run({
      id,
      floorId: floor.id,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      rotation: d.rotation,
      label: d.label,
      department: d.department ?? null,
      deskType: d.deskType,
      assignedPersonId: d.assignedPersonId ?? null,
      status: d.status,
    });
    return id;
  });

  logAudit({ user: req.user, action: 'batch_create', entityType: 'desk', entityId: null, details: { floorId: floor.id, count: created.length } });
  res.status(201).json(created.map((id) => mapDesk(getDeskWithPerson.get(id))));
});

router.patch('/batch', requireRole('admin'), validateBody(deskBatchUpdateSchema), (req, res) => {
  const { ids, changes } = req.body;
  const rows = [...new Set(ids)].map((id) => getDeskRow.get(id)).filter(Boolean);
  if (!rows.length) return res.status(404).json({ error: 'No matching desks found.' });
  if (changes.assignedPersonId && !personExists.get(changes.assignedPersonId)) {
    return res.status(400).json({ error: 'assignedPersonId does not reference a known person.' });
  }

  const floorIds = [...new Set(rows.map((r) => r.floor_id))];
  for (const floorId of floorIds) snapshotFloor(floorId, req.user);

  for (const row of rows) {
    updateDeskStmt.run({
      id: row.id,
      x: changes.x ?? row.x,
      y: changes.y ?? row.y,
      width: changes.width ?? row.width,
      height: changes.height ?? row.height,
      rotation: changes.rotation ?? row.rotation,
      label: changes.label ?? row.label,
      department: changes.department !== undefined ? changes.department : row.department,
      deskType: changes.deskType ?? row.desk_type,
      assignedPersonId: changes.assignedPersonId !== undefined ? changes.assignedPersonId : row.assigned_person_id,
      status: changes.status ?? row.status,
    });
  }

  logAudit({ user: req.user, action: 'batch_update', entityType: 'desk', entityId: null, details: { ids: rows.map((r) => r.id), changes } });
  res.json(rows.map((row) => mapDesk(getDeskWithPerson.get(row.id))));
});

router.delete('/batch', requireRole('admin'), validateBody(deskBatchDeleteSchema), (req, res) => {
  const rows = [...new Set(req.body.ids)].map((id) => getDeskRow.get(id)).filter(Boolean);
  if (!rows.length) return res.status(404).json({ error: 'No matching desks found.' });

  const floorIds = [...new Set(rows.map((r) => r.floor_id))];
  for (const floorId of floorIds) snapshotFloor(floorId, req.user);

  for (const row of rows) deleteDeskStmt.run(row.id);

  logAudit({ user: req.user, action: 'batch_delete', entityType: 'desk', entityId: null, details: { ids: rows.map((r) => r.id) } });
  res.json({ ok: true, deletedCount: rows.length });
});

// --- Single-desk operations -------------------------------------------------

router.patch('/:id', requireRole('admin'), validateBody(deskUpdateSchema), (req, res) => {
  const desk = getDeskRow.get(req.params.id);
  if (!desk) return res.status(404).json({ error: 'Desk not found.' });
  if (req.body.assignedPersonId && !personExists.get(req.body.assignedPersonId)) {
    return res.status(400).json({ error: 'assignedPersonId does not reference a known person.' });
  }

  snapshotFloor(desk.floor_id, req.user);

  const next = {
    x: req.body.x ?? desk.x,
    y: req.body.y ?? desk.y,
    width: req.body.width ?? desk.width,
    height: req.body.height ?? desk.height,
    rotation: req.body.rotation ?? desk.rotation,
    label: req.body.label ?? desk.label,
    department: req.body.department !== undefined ? req.body.department : desk.department,
    deskType: req.body.deskType ?? desk.desk_type,
    assignedPersonId: req.body.assignedPersonId !== undefined ? req.body.assignedPersonId : desk.assigned_person_id,
    status: req.body.status ?? desk.status,
  };

  updateDeskStmt.run({ ...next, id: desk.id });

  logAudit({
    user: req.user,
    action: 'update',
    entityType: 'desk',
    entityId: desk.id,
    details: diffFields(desk, next),
  });

  res.json(mapDesk(getDeskWithPerson.get(desk.id)));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const desk = getDeskRow.get(req.params.id);
  if (!desk) return res.status(404).json({ error: 'Desk not found.' });
  snapshotFloor(desk.floor_id, req.user);
  deleteDeskStmt.run(desk.id);
  logAudit({ user: req.user, action: 'delete', entityType: 'desk', entityId: desk.id, details: { label: desk.label, floorId: desk.floor_id } });
  res.json({ ok: true });
});

function diffFields(before, after) {
  const changed = {};
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'label', 'department', 'status']) {
    const beforeVal = before[key === 'deskType' ? 'desk_type' : key];
    if (beforeVal !== after[key]) changed[key] = { from: beforeVal, to: after[key] };
  }
  if (before.assigned_person_id !== after.assignedPersonId) {
    changed.assignedPersonId = { from: before.assigned_person_id, to: after.assignedPersonId };
  }
  return changed;
}

function mapDesk(row) {
  return {
    id: row.id,
    floorId: row.floor_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    label: row.label,
    department: row.department,
    deskType: row.desk_type,
    status: row.status,
    assignedPersonId: row.assigned_person_id,
    person: row.assigned_person_id
      ? { id: row.assigned_person_id, name: row.person_name, department: row.person_department, email: row.person_email, slack: row.person_slack }
      : null,
  };
}

export default router;
