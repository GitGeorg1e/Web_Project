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


async function cancelAssignment(req, res) {
  try {
    const supervisorId = req.session.user.id;
    const id = Number(req.params.id);
    const { reason } = req.body || {};

    if (!id) return res.status(400).json({ message: 'id required' });

    // Βεβαιώσου ότι η ανάθεση ανήκει στον τρέχοντα καθηγητή
    const [[a]] = await pool.query(
      'SELECT id, status, topic_id FROM assignments WHERE id=? AND supervisor_id=?',
      [id, supervisorId]
    );
    if (!a) return res.status(404).json({ message: 'Assignment not found' });

    // Επιτρέπουμε ακύρωση μόνο πριν “οριστικοποιηθεί”
    if (!['under_assignment', 'active'].includes(a.status)) {
      return res.status(400).json({ message: 'Cancel allowed only for under_assignment or active' });
    }

    // Μην επιτρέπεις ακύρωση αν υπάρχουν βαθμολογίες
    const [[g]] = await pool.query(
      'SELECT COUNT(*) AS c FROM grades WHERE assignment_id=?',
      [id]
    );
    if (g.c > 0) {
      return res.status(400).json({ message: 'Cannot cancel: grades already exist' });
    }

    // Ακύρωσε την ανάθεση
    await pool.query(
      'UPDATE assignments SET status="canceled", canceled_at=NOW(), canceled_reason=? WHERE id=?',
      [reason || 'Canceled by supervisor', id]
    );

    // (Προαιρετικό) Ακύρωσε τυχόν pending προσκλήσεις τριμελούς
   try {
      await pool.query(
        'UPDATE invitations SET status="canceled", responded_at=NOW() WHERE assignment_id=? AND status="pending"',
        [id]
      );
    } catch (e) {
      console.warn('Invitations cancel skipped:', e.sqlMessage || e.message);
      // δεν κάνουμε throw — δεν θέλουμε να σπάσει η ακύρωση λόγω προσκλήσεων
    }

    // (Προαιρετικό) “Απελευθέρωσε” το θέμα ώστε να ξαναδοθεί (αν το θέλεις)
     await pool.query('UPDATE topics SET status="free" WHERE id=?', [a.topic_id]);

    res.json({ ok: true });
  } catch (e) {
    console.error('cancelAssignment error:', e.sqlMessage || e.message);
    res.status(500).json({ message: 'Server error', detail: e.sqlMessage || e.message });
  }
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




async function listMyTheses(req, res) {
  try {
    const teacherId = req.session.user.id;
    const { status, role } = req.query;

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const baseSupervisorSQL = `
      SELECT a.id AS assignment_id, 'supervisor' AS role, a.status AS assignment_status,
             t.title, s.full_name AS student_name, s.username AS student_username,
             a.created_at, a.finalized_at,
             NULL AS committee_status, NULL AS invited_at, NULL AS responded_at
      FROM assignments a
      JOIN topics t ON t.id = a.topic_id
      JOIN users  s ON s.id = a.student_id
      WHERE a.supervisor_id = ?
    `;

    const baseCommitteeSQL = `
      SELECT a.id AS assignment_id, 'committee' AS role, a.status AS assignment_status,
             t.title, s.full_name AS student_name, s.username AS student_username,
             a.created_at, a.finalized_at,
             i.status AS committee_status, i.invited_at, i.responded_at
      FROM invitations i
      JOIN assignments a ON a.id = i.assignment_id
      JOIN topics t      ON t.id = a.topic_id
      JOIN users  s      ON s.id = a.student_id
      WHERE i.invitee_id = ?
    `;

    const statusFilter = status ? ' AND a.status = ?' : '';
    const paramsSup = [teacherId];
    const paramsCom = [teacherId];
    if (status) { paramsSup.push(status); paramsCom.push(status); }

    let sql, params;
    if (role === 'supervisor') {
      sql = `${baseSupervisorSQL}${statusFilter} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [...paramsSup, pageSize, offset];
    } else if (role === 'committee') {
      sql = `${baseCommitteeSQL}${statusFilter} ORDER BY invited_at DESC, created_at DESC LIMIT ? OFFSET ?`;
      params = [...paramsCom, pageSize, offset];
    } else {
      sql = `
        (${baseSupervisorSQL}${statusFilter})
        UNION ALL
        (${baseCommitteeSQL}${statusFilter})
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [...paramsSup, ...paramsCom, pageSize, offset];
    }

    const [rows] = await pool.query(sql, params);
    res.json({
      page, pageSize,
      items: rows.map(r => ({
        assignment_id: r.assignment_id,
        role: r.role,
        status: r.assignment_status,
        title: r.title,
        student: r.student_name || r.student_username,
        created_at: r.created_at,
        finalized_at: r.finalized_at,
        committee_status: r.committee_status,
        invited_at: r.invited_at,
        responded_at: r.responded_at
      }))
    });
  } catch (e) {
    console.error('listMyTheses error:', e.sqlMessage || e.message);
    res.status(500).json({ message: 'Server error', detail: e.sqlMessage || e.message });
  }
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
  listTopics, createTopic, assignTopic, updateTopic, listAssignments,cancelAssignment,
  listInvitations, respondInvitation, stats, exportTheses, confirmAssignment, requestReview, listMyTheses
  
};
