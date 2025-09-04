// src/controllers/studentController.js
const { pool } = require('../config/db');

async function myThesis(req, res) {
  const studentId = req.session.user.id;
  const [[row]] = await pool.query(`
    SELECT a.id, a.status, t.title, t.description, a.created_at
    FROM assignments a
    JOIN topics t ON a.topic_id=t.id
    WHERE a.student_id=?
    ORDER BY a.created_at DESC LIMIT 1
  `,[studentId]);
  res.json(row || null);
}

async function updateProfile(req, res) {
  const userId = req.session.user.id;
  const { address, email_contact, phone_mobile, phone_landline } = req.body;
  await pool.query(`
    INSERT INTO student_profiles (user_id, address, email_contact, phone_mobile, phone_landline)
    VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE address=VALUES(address), email_contact=VALUES(email_contact),
    phone_mobile=VALUES(phone_mobile), phone_landline=VALUES(phone_landline)
  `, [userId, address || null, email_contact || null, phone_mobile || null, phone_landline || null]);
  res.json({ ok: true });
}

module.exports = { myThesis, updateProfile };
