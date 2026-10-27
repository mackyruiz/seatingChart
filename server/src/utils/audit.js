import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

const insertAudit = db.prepare(`
  INSERT INTO audit_log (id, user_id, user_email, action, entity_type, entity_id, details)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Records an audit entry. `details` is any JSON-serializable summary of what
 * changed (kept small — this is an audit trail, not a full snapshot store;
 * see snapshots.js for the desk-layout undo history).
 */
export function logAudit({ user, action, entityType, entityId, details }) {
  insertAudit.run(
    randomUUID(),
    user?.id ?? null,
    user?.email ?? null,
    action,
    entityType,
    entityId ?? null,
    details === undefined ? null : JSON.stringify(details)
  );
}
