// src/controllers/teacherController.js
const { pool } = require('../config/db');
const path = require('path');
const fs = require('fs');

async function listTopics(req, res) {
  const teacherId = req.session.user.id;
  const [rows] = await pool.query('SELECT id, title, description, pdf_path, created_at FROM topics WHERE created_by=? ORDER BY created_at DESC', [teacherId]);
  res.json(rows);
}

async function createTopic(req, res) {
  try {
    const teacherId = req.session.user.id;
    const { title, description } = req.body || {};
    if (!title) return res.status(400).json({ message: 'Title required' });

    const pdf_path = req.file ? `/uploads/topic_pdfs/${req.file.filename}` : null;

    const [r] = await pool.query(
      'INSERT INTO topics (title, description, pdf_path, created_by) VALUES (?,?,?,?)',
      [title, description || null, pdf_path, teacherId]
    );
    res.status(201).json({ ok: true, id: r.insertId, pdf_path });
  } catch (e) {
    console.error(e); res.status(500).json({ message: 'Σφάλμα διακομιστή' });
  }
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

async function updateTopic(req, res) {
  try {
    const teacherId = req.session.user.id;
    const { id } = req.params;
    const { title, description } = req.body || {};

    const [[topic]] = await pool.query('SELECT id, created_by, pdf_path FROM topics WHERE id=?', [id]);
    if (!topic) return res.status(404).json({ message: 'Topic not found' });
    if (topic.created_by !== teacherId) return res.status(403).json({ message: 'Forbidden' });

    let newPdfPath = topic.pdf_path;
    if (req.file) {
      newPdfPath = `/uploads/topic_pdfs/${req.file.filename}`;
      if (topic.pdf_path && topic.pdf_path.startsWith('/uploads/')) {
        const abs = path.join(__dirname, '..', '..', topic.pdf_path);
        fs.unlink(abs, () => {});
      }
    }

    const fields = [];
    const params = [];
    if (title !== undefined) { fields.push('title=?'); params.push(title); }
    if (description !== undefined) { fields.push('description=?'); params.push(description); }
    if (req.file) { fields.push('pdf_path=?'); params.push(newPdfPath); }

    if (!fields.length) return res.json({ ok: true, id });

    params.push(id, teacherId);
    const sql = `UPDATE topics SET ${fields.join(', ')} WHERE id=? AND created_by=?`;
    const [r] = await pool.query(sql, params);
    if (!r.affectedRows) return res.status(400).json({ message: 'Δεν ενημερώθηκε' });

    res.json({ ok: true, id, pdf_path: newPdfPath });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Σφάλμα διακομιστή' });
  }
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
    SELECT i.id, i.assignment_id, t.title, u.username AS student, i.status, i.invited_at, i.responded_at
    FROM invitations i
    JOIN assignments a ON i.assignment_id=a.id
    JOIN topics t ON a.topic_id=t.id
    JOIN users  u      ON a.student_id=u.id 
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
   if (!r.affectedRows) return res.status(400).json({ message: 'Δεν ενημερώθηκε' });
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

// --- under_assignment -> active
async function confirmAssignment(req, res) {
  try {
    const supervisorId = req.session.user.id;
    const { id } = req.params;

    const [r] = await pool.query(
      'UPDATE assignments SET status="active" WHERE id=? AND supervisor_id=? AND status="under_assignment"',
      [id, supervisorId]
    );

    if (!r.affectedRows) {
      return res.status(400).json({ message: 'Δεν μπορεί να οριστικοποιηθεί (λάθος κατάσταση ή δεν είστε ο επιβλέπων)' });
    }
    res.json({ ok: true, status: 'active' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Σφάλμα διακομιστή' });
  }
}

// --- active -> under_review
async function requestReview(req, res) {
  try {
    const supervisorId = req.session.user.id;
    const { id } = req.params;

    const [r] = await pool.query(
      'UPDATE assignments SET status="under_review" WHERE id=? AND supervisor_id=? AND status="active"',
      [id, supervisorId]
    );

    if (!r.affectedRows) {
      return res.status(400).json({ message: 'Δεν μπορεί να σταλεί για εξέταση (λάθος κατάσταση ή δεν είστε ο επιβλέπων)' });
    }
    res.json({ ok: true, status: 'under_review' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Σφάλμα διακομιστή' });
  }
}




module.exports = {
  listTopics, createTopic, assignTopic, updateTopic, listAssignments,
  listInvitations, respondInvitation, stats, exportTheses, confirmAssignment, requestReview
  
};
