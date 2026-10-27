// Data export (spec §5, Data export) — the one thing the old PDF couldn't do.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth);

const exportQuery = db.prepare(`
  SELECT s.name AS site, f.name AS floor, d.label, d.department, d.desk_type, d.status,
         d.x, d.y, d.width, d.height, d.rotation,
         p.name AS person_name, p.department AS person_department, p.email AS person_email
  FROM desks d
  JOIN floors f ON f.id = d.floor_id
  JOIN sites s ON s.id = f.site_id
  LEFT JOIN people p ON p.id = d.assigned_person_id
  WHERE (@siteId IS NULL OR s.id = @siteId) AND (@floorId IS NULL OR f.id = @floorId)
  ORDER BY s.name, f.name, d.label
`);

router.get('/json', (req, res) => {
  const rows = exportQuery.all({ siteId: req.query.siteId ?? null, floorId: req.query.floorId ?? null });
  logAudit({ user: req.user, action: 'export', entityType: 'desks', entityId: null, details: { format: 'json', ...req.query } });
  res.setHeader('Content-Disposition', 'attachment; filename="seating-export.json"');
  res.json(rows);
});

router.get('/csv', (req, res) => {
  const rows = exportQuery.all({ siteId: req.query.siteId ?? null, floorId: req.query.floorId ?? null });
  logAudit({ user: req.user, action: 'export', entityType: 'desks', entityId: null, details: { format: 'csv', ...req.query } });

  const columns = ['site', 'floor', 'label', 'department', 'desk_type', 'status', 'person_name', 'person_department', 'person_email', 'x', 'y', 'width', 'height', 'rotation'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="seating-export.csv"');
  res.send(lines.join('\n'));
});

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export default router;
