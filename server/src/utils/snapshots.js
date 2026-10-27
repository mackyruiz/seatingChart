// "Last 10 versions" undo for a floor's desk layout (per spec §5, Change
// tracking). Deliberately simple: a full JSON snapshot of every desk on the
// floor, taken before each mutation, capped at 10 per floor. Not git-level
// history — just enough that a bad bulk edit can be rolled back in one click.
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

const MAX_SNAPSHOTS_PER_FLOOR = 10;

const selectDesksForFloor = db.prepare('SELECT * FROM desks WHERE floor_id = ? ORDER BY created_at');
const insertSnapshot = db.prepare(`
  INSERT INTO floor_snapshots (id, floor_id, snapshot, created_by, created_by_email)
  VALUES (?, ?, ?, ?, ?)
`);
const pruneOldSnapshots = db.prepare(`
  DELETE FROM floor_snapshots
  WHERE floor_id = ?
    AND id NOT IN (
      SELECT id FROM floor_snapshots WHERE floor_id = ? ORDER BY created_at DESC LIMIT ?
    )
`);
export const listSnapshots = db.prepare(
  'SELECT id, floor_id, created_by_email, created_at FROM floor_snapshots WHERE floor_id = ? ORDER BY created_at DESC'
);
export const getSnapshot = db.prepare('SELECT * FROM floor_snapshots WHERE id = ?');

/** Snapshot the current desk layout for a floor before mutating it. */
export function snapshotFloor(floorId, user) {
  const desks = selectDesksForFloor.all(floorId);
  insertSnapshot.run(randomUUID(), floorId, JSON.stringify(desks), user?.id ?? null, user?.email ?? null);
  pruneOldSnapshots.run(floorId, floorId, MAX_SNAPSHOTS_PER_FLOOR);
}
