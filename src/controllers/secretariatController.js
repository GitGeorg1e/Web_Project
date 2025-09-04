// src/controllers/secretariatController.js
const { pool } = require('../config/db');

async function listActiveAndReview(req, res) {
  const [rows] = await pool.query(`
    SELECT a.id, a.status, t.title, u.username AS student
    FROM assignments a
    JOIN topics t ON a.topic_id=t.id
    JOIN users u ON a.student_id=u.id
    WHERE a.status IN ('active','under_review')
    ORDER BY a.created_at DESC
  `);
  res.json(rows);
}

// JSON import (array of users with fields)
async function importUsers(req, res) {
  const { items } = req.body; // [{username, role, full_name, email}]
  if (!Array.isArray(items)) return res.status(400).json({ message: 'items[] required' });
  const values = items.map(x => [x.username, x.role || 'student', x.full_name || null, x.email || null]);
  await pool.query('INSERT IGNORE INTO users (username, password, role, full_name, email) VALUES ?',
    [values.map(v => [v[0], '$2a$10$placeholderplaceholderplaceholderpl', v[1], v[2], v[3]])] // βάλε random pass μετά
  );
  res.json({ ok: true, inserted: values.length });
}

module.exports = { listActiveAndReview, importUsers };
