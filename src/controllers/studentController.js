// src/controllers/studentController.js
const { pool } = require('../config/db');




// ───── ΥΠΑΡΧΟΝΤΑ ΔΙΚΑ ΣΟΥ ─────
// Επιστρέφει την πιο πρόσφατη ΔΕ του φοιτητή με "πλούσια" στοιχεία
async function myThesis(req, res) {
  const studentId = req.session.user.id;

  // Κεφαλίδα ΔΕ (θέμα/περιγραφή/pdf/κατάσταση + χρόνος από επίσημη ανάθεση)
  const [[head]] = await pool.query(`
    SELECT
      a.id,
      a.status,
      a.created_at,
      a.activated_at,
      t.title,
      t.description,
      t.pdf_path AS topic_pdf,
      CASE
        WHEN a.created_at IS NOT NULL
          THEN TIMESTAMPDIFF(DAY, a.created_at, NOW())
        ELSE NULL
      END AS days_since_official_assignment
    FROM assignments a
    JOIN topics t ON t.id = a.topic_id
    WHERE a.student_id = ?
    ORDER BY a.created_at DESC
    LIMIT 1
  `, [studentId]);

  if (!head) return res.json(null);

  // Μέλη τριμελούς (αν έχουν οριστεί)
  const [committee] = await pool.query(`
    SELECT
      u.id,
      u.full_name,
      u.username,
      u.email,
      i.status
    FROM invitations i
    JOIN users u ON u.id = i.invitee_id
    WHERE i.assignment_id = ?
    ORDER BY (i.status='accepted') DESC, i.invited_at ASC
  `, [head.id]);

  // Τελική απόκριση
  res.json({
    id: head.id,
    status: head.status,
    title: head.title,
    description: head.description,
    topic_pdf: head.topic_pdf, // π.χ. "/uploads/topic_pdfs/....pdf" (αν υπάρχει)
    created_at: head.created_at,
    activated_at: head.activated_at,
    days_since_official_assignment: head.days_since_official_assignment, // null αν δεν έχει γίνει επίσημη ανάθεση
    committee, // [] αν δεν έχουν οριστεί
  });
}


async function updateProfile(req, res) {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ ok:false, message: 'Not authenticated' });
    }
    const userId = req.session.user.id;
    const { address, email_contact, phone_mobile, phone_landline } = req.body;

    await pool.query(`
      INSERT INTO student_profiles (user_id, address, email_contact, phone_mobile, phone_landline)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        address=VALUES(address),
        email_contact=VALUES(email_contact),
        phone_mobile=VALUES(phone_mobile),
        phone_landline=VALUES(phone_landline)
    `, [
      userId,
      address || null,
      email_contact || null,
      phone_mobile || null,
      phone_landline || null
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('updateProfile error:', e); // δες terminal
    return res.status(500).json({ ok:false, message:'DB error', detail: e.message });
  }
}


// ───── ΒΟΗΘΗΤΙΚΟ ─────
async function assertMyAssignment(studentId, assignmentId) {
  const [[row]] = await pool.query(
    'SELECT id, status FROM assignments WHERE id=? AND student_id=?',
    [assignmentId, studentId]
  );
  if (!row) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  return row;
}

// ───── Επιτροπή (Invitations) ─────

// POST /api/student/committee/invite  body: { assignment_id, invitee_id }
async function inviteTeacher(req, res) {
  try {
    const studentId = req.session.user.id;
    const { assignment_id, invitee_id } = req.body;
    if (!assignment_id || !invitee_id) {
      return res.status(400).json({ message: 'assignment_id & invitee_id required' });
    }
    const asg = await assertMyAssignment(studentId, Number(assignment_id));
    if (asg.status !== 'under_assignment') {
      return res.status(400).json({ message: 'Invitations allowed only in under_assignment' });
    }

    const [[exists]] = await pool.query(
      'SELECT id FROM invitations WHERE assignment_id=? AND invitee_id=? AND status IN ("pending","accepted")',
      [assignment_id, invitee_id]
    );
    if (exists) return res.status(409).json({ message: 'Already invited' });

    await pool.query(
      'INSERT INTO invitations (assignment_id, invitee_id, status) VALUES (?,?, "pending")',
      [assignment_id, invitee_id]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Server error' });
  }
}

// GET /api/student/committee?assignment_id=...
async function listCommittee(req, res) {
  try {
    const studentId = req.session.user.id;
    const assignment_id = Number(req.query.assignment_id);
    if (!assignment_id) return res.status(400).json({ message: 'assignment_id required' });

    await assertMyAssignment(studentId, assignment_id);

    const [rows] = await pool.query(`
      SELECT i.id, i.status, i.invited_at, i.responded_at,
             u.id AS teacher_id, u.full_name, u.username, u.email
      FROM invitations i
      JOIN users u ON u.id = i.invitee_id
      WHERE i.assignment_id=?
      ORDER BY i.invited_at DESC
    `, [assignment_id]);

    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Server error' });
  }
}

// DELETE /api/student/committee/invite/:id  (cancel pending)
async function cancelInvite(req, res) {
  try {
    const studentId = req.session.user.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'id required' });

    const [[inv]] = await pool.query(`
      SELECT i.id, i.status, a.student_id
      FROM invitations i
      JOIN assignments a ON a.id = i.assignment_id
      WHERE i.id=?
    `, [id]);

    if (!inv || inv.student_id !== studentId) return res.status(404).json({ message: 'Not found' });
    if (inv.status !== 'pending') return res.status(400).json({ message: 'Only pending can be canceled' });

    await pool.query('UPDATE invitations SET status="canceled", responded_at=NOW() WHERE id=?', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
}

// ───── Draft/Links – Εξέταση – Repository ─────

// POST /api/student/assignment/:id/draft  body: { draft_url, links:[...] }
async function updateDraft(req, res) {
  try {
    const studentId = req.session.user.id;
    const assignmentId = Number(req.params.id);
    const { draft_url, links } = req.body;
    const asg = await assertMyAssignment(studentId, assignmentId);

    if (!['under_assignment','active','under_review'].includes(asg.status)) {
      return res.status(400).json({ message: 'Not allowed in current status' });
    }

    const linksJson = Array.isArray(links) ? JSON.stringify(links) : null;

    await pool.query(
      'UPDATE assignments SET draft_url=?, extra_links_json=? WHERE id=?',
      [draft_url || null, linksJson, assignmentId]
    );

    // Προαιρετικό auto: αν είναι active και ανέβηκε draft → under_review
    if (asg.status === 'active' && draft_url) {
      await pool.query('UPDATE assignments SET status="under_review" WHERE id=?', [assignmentId]);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Server error' });
  }
}

// POST /api/student/assignment/:id/exam  body: { exam_datetime, exam_mode, exam_room, meeting_url }
async function updateExam(req, res) {
  try {
    const studentId = req.session.user.id;
    const assignmentId = Number(req.params.id);
    const { exam_datetime, exam_mode, exam_room, meeting_url } = req.body;

    const asg = await assertMyAssignment(studentId, assignmentId);
    if (asg.status !== 'under_review') {
      return res.status(400).json({ message: 'Exam details allowed only in under_review' });
    }

    await pool.query(
      `UPDATE assignments
       SET exam_datetime=?, exam_mode=?, exam_room=?, meeting_url=?
       WHERE id=?`,
      [exam_datetime || null, exam_mode || null, exam_room || null, meeting_url || null, assignmentId]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Server error' });
  }
}

// POST /api/student/assignment/:id/repository  body: { repository_url }
async function setRepository(req, res) {
  try {
    const studentId = req.session.user.id;
    const assignmentId = Number(req.params.id);
    const { repository_url } = req.body;

    const asg = await assertMyAssignment(studentId, assignmentId);
    if (!['under_review','completed'].includes(asg.status)) {
      return res.status(400).json({ message: 'Repository allowed only after review started' });
    }

    await pool.query('UPDATE assignments SET repository_url=? WHERE id=?',
      [repository_url || null, assignmentId]);

    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Server error' });
  }
}

// ───── Πρακτικό εξέτασης (HTML) ─────

// GET /api/student/assignment/:id/report
async function viewReportHtml(req, res) {
  try {
    const studentId = req.session.user.id;
    const assignmentId = Number(req.params.id);

    await assertMyAssignment(studentId, assignmentId);

    const [[head]] = await pool.query(`
      SELECT a.id, a.status, a.exam_datetime, a.exam_mode, a.exam_room, a.meeting_url,
             a.draft_url, a.repository_url,
             t.title,
             u.username AS student_username, u.full_name AS student_name
      FROM assignments a
      JOIN topics t    ON t.id=a.topic_id
      JOIN users  u    ON u.id=a.student_id
      WHERE a.id=?`, [assignmentId]);

    const [committee] = await pool.query(`
      SELECT i.status, prof.full_name, prof.username, prof.email, i.invited_at, i.responded_at
      FROM invitations i
      JOIN users prof ON prof.id = i.invitee_id
      WHERE i.assignment_id=?`, [assignmentId]);

    const [grades] = await pool.query(`
      SELECT g.total, prof.full_name AS grader_name
      FROM grades g
      JOIN users prof ON prof.id=g.grader_id
      WHERE g.assignment_id=?`, [assignmentId]);

    const avg = grades.length ? (grades.reduce((s,g)=>s+Number(g.total),0)/grades.length).toFixed(2) : '—';

    const html = `
<!doctype html><html lang="el"><meta charset="utf-8">
<title>Πρακτικό εξέτασης — ΔΕ #${assignmentId}</title>
<body style="font-family:system-ui;max-width:900px;margin:24px auto;line-height:1.4">
<h1>Πρακτικό εξέτασης</h1>
<p><strong>Θέμα:</strong> ${head.title}</p>
<p><strong>Φοιτητής:</strong> ${head.student_name || head.student_username}</p>
<p><strong>Κατάσταση:</strong> ${head.status}</p>
<p><strong>Ημ/νία εξέτασης:</strong> ${head.exam_datetime || '—'}</p>
<p><strong>Τρόπος:</strong> ${head.exam_mode || '—'} ${head.exam_room ? ' / Αίθουσα: '+head.exam_room : ''} ${head.meeting_url? ' / Σύνδεσμος: '+head.meeting_url : ''}</p>
<h3>Τριμελής</h3>
<ul>
  ${committee.map(c => `<li>${c.full_name || c.username} — ${c.status}</li>`).join('')}
</ul>
<h3>Βαθμολογίες</h3>
<ul>
  ${grades.map(g => `<li>${g.grader_name}: <strong>${g.total}</strong></li>`).join('')}
</ul>
<p><strong>Μέσος όρος:</strong> ${avg}</p>
<p><strong>Draft:</strong> ${head.draft_url ? `<a href="${head.draft_url}">${head.draft_url}</a>` : '—'}</p>
<p><strong>Repository:</strong> ${head.repository_url ? `<a href="${head.repository_url}">${head.repository_url}</a>` : '—'}</p>
</body></html>`.trim();

    res.set('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Server error' });
  }
}

// ───── EXPORTS ─────
module.exports = {
  myThesis, updateProfile,
  inviteTeacher, listCommittee, cancelInvite,
  updateDraft, updateExam, setRepository, viewReportHtml
};




