// Auth abstraction layer.
//
// Everything in this app calls `authenticate()` / `issueSession()` /
// `verifySession()` from THIS module rather than touching bcrypt/JWT
// directly. That is the seam the spec asks for: v1 is email+password, but
// swapping in SAML SSO with Just-In-Time provisioning later should mean
// adding a new provider function here (e.g. `authenticateSaml(profile)` that
// calls the same `findOrProvisionUser`), not rewriting routes/middleware.
//
// A SAML upgrade would look like:
//   1. Add `passport-saml` and mount a `/auth/saml/callback` route.
//   2. On a successful assertion, call `findOrProvisionUser({ email, name })`
//      below (already handles "create with default role if new").
//   3. Call `issueSession(user)` exactly as the password login route does.
// No changes needed to route guards, role checks, or the frontend session
// model, since they only ever see the resulting session cookie + user object.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-me-to-a-long-random-string') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a strong random value in production.');
  }
  console.warn('[auth] Using an insecure default JWT_SECRET — set JWT_SECRET before deploying.');
}
const SECRET = JWT_SECRET || 'dev-only-insecure-secret';
const SESSION_TTL = '12h';

const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = ? AND archived = 0');
const selectUserById = db.prepare('SELECT * FROM users WHERE id = ? AND archived = 0');
const insertUser = db.prepare(
  `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`
);

export function toPublicUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Local email/password credential check. Returns the user row or null. */
export async function authenticateLocal(email, password) {
  const user = selectUserByEmail.get(String(email || '').toLowerCase().trim());
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

/** Creates a signed, short-lived session token for a user row. */
export function issueSession(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: SESSION_TTL });
}

/** Verifies a session token, returning { sub, role } or throwing. */
export function verifySession(token) {
  return jwt.verify(token, SECRET);
}

export function getUserById(id) {
  return selectUserById.get(id);
}

/**
 * Find-or-create a user for a federated identity assertion (e.g. SAML).
 * Not wired to a route yet (no IdP configured for v1), but authorization
 * and session issuance are already shared with local login via this
 * function + issueSession(), so adding the callback route later is the only
 * remaining step.
 */
export function findOrProvisionUser({ email, name }, defaultRole = 'employee') {
  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = selectUserByEmail.get(normalizedEmail);
  if (existing) return existing;
  const id = randomUUID();
  // Federated users have no local password; store an unguessable random
  // hash so the row still satisfies the NOT NULL constraint and can never
  // be used to log in via the password path.
  const unusablePasswordHash = bcrypt.hashSync(randomUUID() + randomUUID(), 10);
  insertUser.run(id, normalizedEmail, unusablePasswordHash, name || normalizedEmail, defaultRole);
  return selectUserById.get(id);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}
