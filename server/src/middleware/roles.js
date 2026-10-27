// Server-side role enforcement. The frontend also hides buttons a role
// can't use, but per the spec's security requirements every mutating/admin
// route re-checks the role here regardless of what the UI shows.
const RANK = { employee: 0, manager: 1, admin: 2, owner: 3 };

/** Require the caller's role to be at least `minRole` in the rank above. */
export function requireRole(minRole) {
  const minRank = RANK[minRole];
  return (req, res, next) => {
    const role = req.user?.role;
    if (role === undefined || RANK[role] === undefined || RANK[role] < minRank) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

/** Require the caller's role to be exactly one of the listed roles. */
export function requireExactRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}
