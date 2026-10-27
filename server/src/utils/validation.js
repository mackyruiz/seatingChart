// Central input validation (zod). All routes parse `req.body`/`req.params`
// through one of these before touching the database — every query elsewhere
// uses parameterized statements, so this layer's job is shape/type/length
// checks and stripping control characters from free-text fields (defense in
// depth against XSS in anything that ever renders as HTML, even though desk
// labels are drawn on a <canvas> today and not interpreted as markup).
import { z } from 'zod';

// Strips control characters (codepoints 0-31 and 127 — they have no
// legitimate use in a desk label, name, or note) and trims whitespace.
function stripControlChars(input) {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code > 31 && code !== 127) out += ch;
  }
  return out.trim();
}

const cleanText = (max) =>
  z
    .string()
    .max(max)
    .transform(stripControlChars);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
  name: cleanText(200).pipe(z.string().min(1)),
  role: z.enum(['employee', 'manager', 'admin', 'owner']),
});

export const updateUserSchema = z.object({
  name: cleanText(200).pipe(z.string().min(1)).optional(),
  role: z.enum(['employee', 'manager', 'admin', 'owner']).optional(),
  archived: z.boolean().optional(),
});

export const siteSchema = z.object({
  name: cleanText(200).pipe(z.string().min(1)),
});

export const floorSchema = z.object({
  name: cleanText(200).pipe(z.string().min(1)),
  siteId: z.string().min(1),
});

export const deskCreateSchema = z.object({
  floorId: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(2000).default(60),
  height: z.number().positive().max(2000).default(40),
  rotation: z.number().finite().default(0),
  label: cleanText(80).default(''),
  department: cleanText(120).optional().nullable(),
  deskType: cleanText(40).default('standard'),
  assignedPersonId: z.string().nullable().optional(),
  status: z.enum(['active', 'reserved', 'unavailable']).default('active'),
});

export const deskUpdateSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().max(2000).optional(),
  height: z.number().positive().max(2000).optional(),
  rotation: z.number().finite().optional(),
  label: cleanText(80).optional(),
  department: cleanText(120).nullable().optional(),
  deskType: cleanText(40).optional(),
  assignedPersonId: z.string().nullable().optional(),
  status: z.enum(['active', 'reserved', 'unavailable']).optional(),
});

// Batch variants used for copy/paste (batch create), "make these desks the
// same size" (batch update), and multi-select delete. Capped at 500/200
// items — comfortably above the spec's ~100-200 desks per site, but bounded
// so a single request can't be used to hang the server or blow past SQLite's
// per-statement limits.
export const deskBatchCreateSchema = z.object({
  floorId: z.string().min(1),
  desks: z.array(deskCreateSchema.omit({ floorId: true })).min(1).max(200),
});

export const deskBatchUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  changes: deskUpdateSchema,
});

export const deskBatchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const personSchema = z.object({
  name: cleanText(200).pipe(z.string().min(1)),
  department: cleanText(120).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable(),
  slack: cleanText(120).optional().nullable(),
});

export const changeRequestSchema = z.object({
  floorId: z.string().min(1),
  deskId: z.string().nullable().optional(),
  message: cleanText(1000).pipe(z.string().min(1)),
});

/** Express middleware factory: validates req.body against a zod schema. */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid input.', details: result.error.flatten() });
    }
    req.body = result.data;
    next();
  };
}
