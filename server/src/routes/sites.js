import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody, siteSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth);

const listSites = db.prepare('SELECT * FROM sites ORDER BY archived, name');
const getSite = db.prepare('SELECT * FROM sites WHERE id = ?');
const insertSite = db.prepare('INSERT INTO sites (id, name) VALUES (?, ?)');
const renameSite = db.prepare("UPDATE sites SET name = ?, updated_at = datetime('now') WHERE id = ?");
const archiveSite = db.prepare("UPDATE sites SET archived = ?, updated_at = datetime('now') WHERE id = ?");

// Everyone logged in can list sites (needed for the picker); only
// admin/owner can create, rename, or archive one.
router.get('/', (req, res) => {
  res.json(listSites.all().map(mapSite));
});

router.post('/', requireRole('admin'), validateBody(siteSchema), (req, res) => {
  const id = randomUUID();
  insertSite.run(id, req.body.name);
  logAudit({ user: req.user, action: 'create', entityType: 'site', entityId: id, details: { name: req.body.name } });
  res.status(201).json(mapSite(getSite.get(id)));
});

router.patch('/:id', requireRole('admin'), validateBody(siteSchema), (req, res) => {
  const site = getSite.get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found.' });
  renameSite.run(req.body.name, site.id);
  logAudit({ user: req.user, action: 'rename', entityType: 'site', entityId: site.id, details: { from: site.name, to: req.body.name } });
  res.json(mapSite(getSite.get(site.id)));
});

router.post('/:id/archive', requireRole('admin'), (req, res) => {
  const site = getSite.get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found.' });
  archiveSite.run(1, site.id);
  logAudit({ user: req.user, action: 'archive', entityType: 'site', entityId: site.id });
  res.json(mapSite(getSite.get(site.id)));
});

router.post('/:id/unarchive', requireRole('admin'), (req, res) => {
  const site = getSite.get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found.' });
  archiveSite.run(0, site.id);
  logAudit({ user: req.user, action: 'unarchive', entityType: 'site', entityId: site.id });
  res.json(mapSite(getSite.get(site.id)));
});

function mapSite(row) {
  return { id: row.id, name: row.name, archived: !!row.archived, createdAt: row.created_at };
}

export default router;
