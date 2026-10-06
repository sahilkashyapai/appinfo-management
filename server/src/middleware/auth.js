const { verifyToken } = require('../utils/token');
const { loadUser } = require('../db/users');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authenticated.' });

    const payload = verifyToken(token);
    if (payload.stage !== 'full') {
      return res.status(401).json({ message: 'Two-factor verification required.' });
    }

    const user = await loadUser(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ message: 'Not authenticated.' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    // Proadmin has every permission an admin/superadmin has, regardless of which
    // roles a given route was written to require — see utils/roles.js.
    if (req.user.role === 'proadmin') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
