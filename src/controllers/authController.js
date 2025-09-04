// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

async function login(req, res) {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT id, username, password, role, full_name FROM users WHERE username=?', [username]);
    if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });
    const u = rows[0];
    const ok = bcrypt.compareSync(password, u.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    req.session.user = { id: u.id, username: u.username, role: u.role, full_name: u.full_name };
    const redirect = u.role === 'teacher' ? '/teacher.html'
                   : u.role === 'student' ? '/student.html'
                   : '/secretary.html';
    res.json({ ok: true, redirect, user: req.session.user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
}

function me(req, res) {
  res.json({ user: req.session.user || null });
}

function logout(req, res) {
  req.session.destroy(() => res.json({ ok: true }));
}

module.exports = { login, me, logout };
