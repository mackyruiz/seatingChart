// Admin/IT utility: reset any account's password directly against the
// database. For when someone is locked out (including the owner account
// itself) — no self-service "forgot password" flow exists in v1 (per the
// spec, that's an acceptable v1 tradeoff; see README's auth notes), so this
// is the supported way to regain access or rotate a credential.
//
// Usage:
//   npm run reset-password -- <email> [new-password]
//
// If no password is given, a random one is generated and printed once.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { hashPassword } from './auth/provider.js';
import { logAudit } from './utils/audit.js';

async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  if (!emailArg) {
    console.error('Usage: npm run reset-password -- <email> [new-password]');
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }
  if (user.archived) {
    console.error(`${email} is archived. Unarchive it first (Admin → Users & roles) if you want it usable again.`);
    process.exit(1);
  }

  const password = passwordArg || randomBytes(9).toString('base64url');
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

  // Attributed to the account itself, not a logged-in actor — this runs
  // with direct database/server access, outside the web app's auth.
  logAudit({
    user: { id: user.id, email: user.email },
    action: 'password_reset_cli',
    entityType: 'user',
    entityId: user.id,
  });

  console.log(`Password reset for ${email}.`);
  if (!passwordArg) {
    console.log(`  new password: ${password}  (generated — save this, it will not be shown again)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
