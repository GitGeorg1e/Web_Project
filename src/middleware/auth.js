// src/middleware/auth.js
function ensureAuth(req, res, next) {
  if (req.session?.user) return next();

  // Για API: πάντα JSON 401
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Για σελίδες (HTML) μόνο: redirect
  return res.redirect('/');
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
