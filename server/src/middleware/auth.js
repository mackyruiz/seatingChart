import { verifySession, getUserById, toPublicUser } from '../auth/provider.js';

const COOKIE_NAME = 'seating_session';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const payload = verifySession(token);
    const user = getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    req.user = toPublicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }
}

export function cookieOptions() {
  const secure = process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    sameSite: secure ? 'strict' : 'lax',
    secure,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  };
}

export { COOKIE_NAME };
