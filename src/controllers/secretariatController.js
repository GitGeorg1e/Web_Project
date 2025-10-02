// src/controllers/secretariatController.js
const { pool } = require('../config/db');
const bcrypt = require('bcryptjs'); // αντί για bcrypt

// Λίστα ΔΕ που είναι Ενεργές ή Υπό Εξέταση
async function listActiveAndUnderReview(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        a.id,
        a.status,
        a.activated_at,
        a.created_at,
        t.title,
        t.description,
        stu.full_name AS student_name, stu.username AS student_username,
        sup.full_name AS supervisor_name, sup.username AS supervisor_username,
        -- μέρες από ενεργοποίηση (ή από δημιουργία αν δεν έχει activated_at)
        TIMESTAMPDIFF(DAY, COALESCE(a.activated_at, a.created_at), NOW()) AS days_since_assignment,
        -- πόσα μέλη έχουν αποδεχθεί
        (SELECT COUNT(*) FROM invitations i
          WHERE i.assignment_id=a.id AND i.status='accepted') AS accepted_members
      FROM assignments a
      JOIN topics t ON t.id = a.topic_id
      JOIN users stu ON stu.id = a.student_id
      JOIN users sup ON sup.id = a.supervisor_id
      WHERE a.status IN ('active','under_review')
      ORDER BY COALESCE(a.activated_at, a.created_at) DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('secretariat list error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Λεπτομέρειες συγκεκριμένης ΔΕ
async function getAssignmentDetails(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id required' });

    const [[head]] = await pool.query(`
      SELECT
        a.id, a.status, a.created_at, a.activated_at,
        a.exam_datetime, a.exam_mode, a.exam_room, a.meeting_url,
        t.title, t.description,
        stu.full_name AS student_name, stu.username AS student_username, stu.email AS student_email,
        sup.full_name AS supervisor_name, sup.username AS supervisor_username, sup.email AS supervisor_email,
        TIMESTAMPDIFF(DAY, COALESCE(a.activated_at, a.created_at), NOW()) AS days_since_assignment
      FROM assignments a
      JOIN topics t ON t.id = a.topic_id
      JOIN users stu ON stu.id = a.student_id
      JOIN users sup ON sup.id = a.supervisor_id
      WHERE a.id=?
    `, [id]);

    if (!head) return res.status(404).json({ message: 'Not found' });

    const [committee] = await pool.query(`
      SELECT i.status, i.invited_at, i.responded_at,
             u.full_name, u.username, u.email
      FROM invitations i
      JOIN users u ON u.id = i.invitee_id
      WHERE i.assignment_id=?
      ORDER BY i.status='accepted' DESC, i.invited_at ASC
    `, [id]);

    res.json({ ...head, committee });
  } catch (e) {
    console.error('secretariat details error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

async function importUsers(req, res) {
  try {
    const { students, teachers } = req.body || {};
    const items = [];

    if (Array.isArray(students)) {
      for (const s of students) items.push({ ...s, role: 'student' });
    }
    if (Array.isArray(teachers)) {
      for (const t of teachers) items.push({ ...t, role: 'teacher' });
    }

    if (!items.length) {
      return res.status(400).json({ ok: false, message: 'Provide students[] and/or teachers[]' });
    }

    let inserted = 0, updated = 0;
    const errors = [];

    // default κωδικός αν δεν δοθεί (θα τον αλλάζουν μετά)
    const defaultHash = await bcrypt.hash('123456', 10);

    for (const u of items) {
      try {
        const username = (u.username || '').trim();
        const email = (u.email || '').trim();
        const full_name = (u.full_name || null);
        const role = u.role; // 'student' | 'teacher'
        if (!username || !email) {
          errors.push({ username, email, error: 'missing username/email' });
          continue;
        }
        let password_hash = null;
        if (u.password && String(u.password).length) {
          password_hash = await bcrypt.hash(String(u.password), 10);
        }

        // Σημείωση: χρειάζεσαι UNIQUE τουλάχιστον στο email (ιδανικά και στο username)
        // users: (id, username UNIQUE?, password, role, full_name, email UNIQUE, created_at)
        const [r] = await pool.query(
          `INSERT INTO users (username, password, role, full_name, email)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             role=VALUES(role),
             full_name=VALUES(full_name),
             email=VALUES(email)`,
          [username, password_hash || defaultHash, role, full_name, email]
        );

        // MySQL: affectedRows = 1 (insert), = 2 (update via duplicate key)
        if (r.affectedRows === 1) inserted++;
        else if (r.affectedRows === 2) updated++;

      } catch (e) {
        errors.push({ username: u.username, email: u.email, error: e.code || e.message });
      }
    }

    res.json({ ok: true, inserted, updated, errors });
  } catch (e) {
    console.error('importUsers error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
}

async function setGsApproval(req, res) {
  try {
    const id = Number(req.params.id);
    const { number, year } = req.body || {};
    if (!id || !number || !year) {
      return res.status(400).json({ message: 'number & year required' });
    }

    // μόνο σε active
    const [[a]] = await pool.query('SELECT status FROM assignments WHERE id=?', [id]);
    if (!a) return res.status(404).json({ message: 'Not found' });
    if (a.status !== 'active') {
      return res.status(400).json({ message: 'Allowed only when status=active' });
    }

    await pool.query(
      'UPDATE assignments SET ap_gs_number=?, ap_gs_year=? WHERE id=?',
      [String(number), Number(year), id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('setGsApproval error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────────
// 2) Ακύρωση ανάθεσης σε ΕΝΕΡΓΗ ΔΕ
// POST /api/secretariat/assignments/:id/cancel  body: { gs_number, gs_year, reason }
async function cancelAssignment(req, res) {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body || {};

    // ΜΟΝΟ id απαιτείται
    if (!id) return res.status(400).json({ message: 'id required' });

    const [[a]] = await pool.query('SELECT status FROM assignments WHERE id=?', [id]);
    if (!a) return res.status(404).json({ message: 'Not found' });
    if (a.status !== 'active') {
      return res.status(400).json({ message: 'Allowed only when status=active' });
    }

    // ΔΙΟΡΘΩΣΗ: 2 placeholders ⇢ 2 τιμές
    await pool.query(`
      UPDATE assignments
      SET status='canceled',
          canceled_at=NOW(),
          cancel_reason=?
      WHERE id=?`,
      [reason || 'κατόπιν αίτησης Φοιτητή/τριας', id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('cancelAssignment error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}


// ─────────────────────────────────────────────────────────────
// 3) Ολοκλήρωση ΔΕ ("Περατωμένη") από ΥΠΟ ΕΞΕΤΑΣΗ
// Συνθήκες: υπάρχει τουλάχιστον 1 βαθμός ΚΑΙ repository_url
// POST /api/secretariat/assignments/:id/complete  (body κενό)
async function completeIfEligible(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id required' });

    const [[a]] = await pool.query('SELECT status, repository_url FROM assignments WHERE id=?', [id]);
    if (!a) return res.status(404).json({ message: 'Not found' });

    if (a.status !== 'under_review') {
      return res.status(400).json({ message: 'Allowed only when status=under_review' });
    }

    // repository link must exist
    if (!a.repository_url) {
      return res.status(400).json({ message: 'Repository URL is required before completion' });
    }

    // at least one grade present (ή βάλε δικό σου κριτήριο)
    const [[g]] = await pool.query('SELECT COUNT(*) AS c FROM grades WHERE assignment_id=?', [id]);
    if (!g || !g.c) {
      return res.status(400).json({ message: 'At least one grade is required' });
    }

    await pool.query('UPDATE assignments SET status="completed" WHERE id=?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('completeIfEligible error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {

  listActiveAndUnderReview,
  getAssignmentDetails,
  importUsers,
  
  setGsApproval,
  cancelAssignment,
  completeIfEligible
};
