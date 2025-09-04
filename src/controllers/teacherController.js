// src/controllers/teacherController.js
const { pool } = require('../config/db');

async function listTopics(req, res) {
  const teacherId = req.session.user.id;
  const [rows] = await pool.query('SELECT * FROM topics WHERE created_by=? ORDER BY created_at DESC', [teacherId]);
  res.json(rows);
}

async function createTopic(req, res) {
  const teacherId = req.session.user.id;
  const { title, description, pdf_path } = req.body;
  if (!title) return res.status(400).json({ message: 'Title required' });
  const [r] = await pool.query(
    'INSERT INTO topics (title, description, pdf_path, created_by) VALUES (?,?,?,?)',
    [title, description || null, pdf_path || null, teacherId]
  );
  res.json({ ok: true, id: r.insertId });
}

async function assignTopic(req, res) {
  const supervisorId = req.session.user.id;
  const { topic_id, student_id } = req.body;
  if (!topic_id || !student_id) return res.status(400).json({ message: 'topic_id & student_id required' });
  const [r] = await pool.query(
    'INSERT INTO assignments (topic_id, student_id, supervisor_id, status) VALUES (?,?,?,?)',
    [topic_id, student_id, supervisorId, 'under_assignment']
  );
  res.json({ ok: true, id: r.insertId });
}

async function listAssignments(req, res) {
  const supervisorId = req.session.user.id;
  const { status, role } = req.query; // role: supervisor | committee
  let sql = `
    SELECT a.id, a.status, a.created_at, t.title, u.username AS student
    FROM assignments a
    JOIN topics t ON a.topic_id = t.id
    JOIN users u   ON a.student_id = u.id
    WHERE a.supervisor_id=?`;
  const params = [supervisorId];
  if (status) { sql += ' AND a.status = ?'; params.push(status); }
  sql += ' ORDER BY a.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}

async function listInvitations(req, res) {
  const teacherId = req.session.user.id;
  const [rows] = await pool.query(`
    SELECT i.id, t.title, i.status, i.invited_at, i.responded_at
    FROM invitations i
    JOIN assignments a ON i.assignment_id=a.id
    JOIN topics t ON a.topic_id=t.id
    WHERE i.invitee_id=?
    ORDER BY i.invited_at DESC
  `, [teacherId]);
  res.json(rows);
}

async function respondInvitation(req, res) {
  const teacherId = req.session.user.id;
  const { invitation_id, action } = req.body; // 'accept' | 'reject'
  const status = action === 'accept' ? 'accepted' : 'rejected';
  await pool.query(
    'UPDATE invitations SET status=?, responded_at=NOW() WHERE id=? AND invitee_id=?',
    [status, invitation_id, teacherId]
  );
  res.json({ ok: true });
}

async function stats(req, res) {
  const teacherId = req.session.user.id;
  const [[row1]] = await pool.query(`
    SELECT 
      COUNT(*) AS total_supervised,
      AVG(TIMESTAMPDIFF(DAY, a.created_at, COALESCE(a.finalized_at, NOW()))) AS avg_days_open
    FROM assignments a WHERE a.supervisor_id=?
  `, [teacherId]);
  // dummy avg grade just to show chart placeholder (θα συμπληρώσεις όταν βάλεις βαθμολόγηση)
  const [[row2]] = await pool.query(`
    SELECT AVG(g.total) AS avg_grade
    FROM grades g
    JOIN assignments a ON a.id=g.assignment_id
    WHERE a.supervisor_id=?
  `, [teacherId]);
  res.json({ total_supervised: row1.total_supervised || 0, avg_days_open: Number(row1.avg_days_open)||0, avg_grade: Number(row2?.avg_grade)||0 });
}

async function exportTheses(req, res) {
  const teacherId = req.session.user.id;
  const format = (req.query.format || 'json').toLowerCase(); // json | csv
  const [rows] = await pool.query(`
    SELECT a.id, t.title, a.status, u.username AS student, a.created_at
    FROM assignments a
    JOIN topics t ON a.topic_id=t.id
    JOIN users u ON a.student_id=u.id
    WHERE a.supervisor_id=?
    ORDER BY a.created_at DESC`, [teacherId]);

  if (format === 'csv') {
    const header = 'id,title,status,student,created_at';
    const body = rows.map(r => [r.id, r.title, r.status, r.student, r.created_at.toISOString()].join(',')).join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="theses.csv"');
    return res.send(`${header}\n${body}`);
  }
  res.json(rows);
}

module.exports = {
  listTopics, createTopic, assignTopic, listAssignments,
  listInvitations, respondInvitation, stats, exportTheses
  
};
