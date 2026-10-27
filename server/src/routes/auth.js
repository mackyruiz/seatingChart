import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateLocal, issueSession, toPublicUser } from '../auth/provider.js';
import { COOKIE_NAME, cookieOptions, requireAuth } from '../middleware/auth.js';
import { validateBody, loginSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// Brute-force protection on the login endpoint specifically (spec §8: rate
// limiting / abuse protection).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticateLocal(email, password);
  if (!user) {
    logAudit({ user: null, action: 'login_failed', entityType: 'user', entityId: null, details: { email } });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = issueSession(user);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  logAudit({ user: toPublicUser(user), action: 'login', entityType: 'user', entityId: user.id });
  res.json({ user: toPublicUser(user) });
});

router.post('/logout', requireAuth, (req, res) => {
  logAudit({ user: req.user, action: 'logout', entityType: 'user', entityId: req.user.id });
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
