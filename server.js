const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { ensureAuth, requireRole } = require('./src/middleware/auth');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: 'lax' }
}));

// ── CACHE HELPERS
const ONE_DAY   = 24 * 60 * 60;
const THIRTY_D  = 30 * ONE_DAY;
const ONE_YEAR  = 365 * ONE_DAY;
const HASHED_RE = /\.[0-9a-f]{8,}\./i; // app.a1b2c3d4.js

// Static: /uploads → μικρό TTL (π.χ. 5')
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
}));

// Static: /public → HTML no-cache, JS/CSS long TTL, hashed αρχεία 1y immutable
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Vary', 'Accept-Encoding');

    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    if (/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/.test(filePath)) {
      if (HASHED_RE.test(filePath)) {
        res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
      } else {
        res.setHeader('Cache-Control', `public, max-age=${THIRTY_D}`);
      }
      return;
    }
    // default
    res.setHeader('Cache-Control', `public, max-age=${ONE_DAY}`);
  }
}));

// rate-limit login
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login', loginLimiter);

// routes API
app.use('/api/auth',        require('./src/routes/auth'));
app.use('/api/teacher',     require('./src/routes/teacher'));
app.use('/api/student',     require('./src/routes/student'));
app.use('/api/secretariat', require('./src/routes/secretariat'));
app.use('/feed',            require('./src/routes/feed'));

// ── HTML helpers: επειδή χρησιμοποιείς sendFile (δεν περνάει από express.static)
function sendHtmlNoCache(res, filename) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', filename));
}

// protected HTML pages
app.get('/teacher.html',   ensureAuth, requireRole('teacher','admin'),     (req, res) => sendHtmlNoCache(res, 'teacher.html'));
app.get('/student.html',   ensureAuth, requireRole('student','admin'),     (req, res) => sendHtmlNoCache(res, 'student.html'));
app.get('/secretary.html', ensureAuth, requireRole('secretariat','admin'), (req, res) => sendHtmlNoCache(res, 'secretary.html'));

// default → login
app.get('/', (_req, res) => sendHtmlNoCache(res, 'login.html'));

// health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 404
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ message: 'Not found' });
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));