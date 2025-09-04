// src/middleware/auth.js
function ensureAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.accepts(['html','json']) === 'html') return res.redirect('/');
  return res.status(401).json({ message: 'Unauthorized' });
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!allowed.includes(req.session.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = { ensureAuth, requireRole };
