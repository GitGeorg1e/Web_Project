const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { ensureAuth, requireRole } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// security & utils
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

// sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true } // secure: true σε HTTPS
}));

// static
app.use(express.static(path.join(__dirname, 'public')));

// rate-limit μόνο στο login
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login', loginLimiter);

// routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/teacher', require('./src/routes/teacher'));
app.use('/api/student', require('./src/routes/student'));
app.use('/api/secretariat', require('./src/routes/secretariat'));
app.use('/feed', require('./src/routes/feed')); // δημόσιο

// protected HTML pages
app.get('/teacher.html', ensureAuth, requireRole('teacher','admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});
app.get('/student.html', ensureAuth, requireRole('student','admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});
app.get('/secretary.html', ensureAuth, requireRole('secretariat','admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'secretary.html'));
});

// default → login
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// health
app.get('/api/health', (_, res) => res.json({ ok: true }));

// 404
app.use((req, res) => res.status(404).json({ message: 'Not found' }));

// start
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
