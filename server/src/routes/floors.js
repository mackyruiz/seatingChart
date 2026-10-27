import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import sharp from 'sharp';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody, floorSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = Router();
router.use(requireAuth);

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Uploads land in memory first — nothing touches disk until sharp has
// verified it decodes as a real raster image and re-encoded it as a plain
// PNG. That means: no executable content ever reaches disk under an image
// extension, no reliance on a client-supplied MIME type/extension, and PDFs
// get their first page rasterized rather than stored as-is (spec §2/§10:
// "PDF converted to image on upload").
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const listFloors = db.prepare('SELECT * FROM floors WHERE site_id = ? ORDER BY archived, name');
const getFloor = db.prepare('SELECT * FROM floors WHERE id = ?');
const insertFloor = db.prepare('INSERT INTO floors (id, site_id, name) VALUES (?, ?, ?)');
const renameFloor = db.prepare("UPDATE floors SET name = ?, updated_at = datetime('now') WHERE id = ?");
const archiveFloor = db.prepare("UPDATE floors SET archived = ?, updated_at = datetime('now') WHERE id = ?");
const setBackground = db.prepare(
  "UPDATE floors SET background_image = ?, background_width = ?, background_height = ?, updated_at = datetime('now') WHERE id = ?"
);
const siteExists = db.prepare('SELECT id FROM sites WHERE id = ?');

router.get('/', (req, res) => {
  const { siteId } = req.query;
  if (!siteId) return res.status(400).json({ error: 'siteId query param is required.' });
  res.json(listFloors.all(siteId).map(mapFloor));
});

router.get('/:id', (req, res) => {
  const floor = getFloor.get(req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  res.json(mapFloor(floor));
});

router.post('/', requireRole('admin'), validateBody(floorSchema), (req, res) => {
  if (!siteExists.get(req.body.siteId)) return res.status(404).json({ error: 'Site not found.' });
  const id = randomUUID();
  insertFloor.run(id, req.body.siteId, req.body.name);
  logAudit({ user: req.user, action: 'create', entityType: 'floor', entityId: id, details: { name: req.body.name, siteId: req.body.siteId } });
  res.status(201).json(mapFloor(getFloor.get(id)));
});

router.patch('/:id', requireRole('admin'), validateBody(floorSchema.pick({ name: true })), (req, res) => {
  const floor = getFloor.get(req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  renameFloor.run(req.body.name, floor.id);
  logAudit({ user: req.user, action: 'rename', entityType: 'floor', entityId: floor.id, details: { from: floor.name, to: req.body.name } });
  res.json(mapFloor(getFloor.get(floor.id)));
});

router.post('/:id/archive', requireRole('admin'), (req, res) => {
  const floor = getFloor.get(req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  archiveFloor.run(1, floor.id);
  logAudit({ user: req.user, action: 'archive', entityType: 'floor', entityId: floor.id });
  res.json(mapFloor(getFloor.get(floor.id)));
});

router.post('/:id/unarchive', requireRole('admin'), (req, res) => {
  const floor = getFloor.get(req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  archiveFloor.run(0, floor.id);
  logAudit({ user: req.user, action: 'unarchive', entityType: 'floor', entityId: floor.id });
  res.json(mapFloor(getFloor.get(floor.id)));
});

router.post('/:id/background', requireRole('admin'), upload.single('image'), async (req, res) => {
  const floor = getFloor.get(req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded (field name must be "image").' });

  let pipeline = sharp(req.file.buffer, { limitInputPixels: 60_000_000 });
  try {
    // sharp/libvips can rasterize a PDF's first page when built with
    // PDF support; if this particular server build lacks it, decoding
    // throws and we surface a clear message rather than storing the file.
    if (req.file.mimetype === 'application/pdf' || req.file.originalname?.toLowerCase().endsWith('.pdf')) {
      pipeline = sharp(req.file.buffer, { page: 0, limitInputPixels: 60_000_000 });
    }
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) throw new Error('not an image');

    const filename = `${randomUUID()}.png`;
    const destPath = path.join(UPLOADS_DIR, filename);
    const info = await pipeline
      .png()
      .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
      .toFile(destPath);

    // Remove the previous background file for this floor, if any.
    if (floor.background_image) {
      const oldPath = path.join(UPLOADS_DIR, floor.background_image);
      fs.rm(oldPath, { force: true }, () => {});
    }

    setBackground.run(filename, info.width, info.height, floor.id);
    logAudit({ user: req.user, action: 'upload_background', entityType: 'floor', entityId: floor.id, details: { filename } });
    res.json(mapFloor(getFloor.get(floor.id)));
  } catch (err) {
    return res.status(400).json({
      error:
        'Could not read that file as an image. Upload a PNG or JPG (if you have a PDF, convert its first page to PNG/JPG first).',
    });
  }
});

router.get('/uploads/:filename', requireAuth, (req, res) => {
  // Defense in depth: only ever serve a bare filename we generated
  // ourselves (uuid.png), never an arbitrary path.
  const filename = req.params.filename;
  if (!/^[a-f0-9-]+\.png$/i.test(filename)) return res.status(400).end();
  const filePath = path.join(UPLOADS_DIR, filename);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).end();
  });
});

function mapFloor(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    backgroundImage: row.background_image ? `/api/floors/uploads/${row.background_image}` : null,
    backgroundWidth: row.background_width,
    backgroundHeight: row.background_height,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

export default router;
