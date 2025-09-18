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

    const [[a]] = await pool.query(
      'SELECT id, status, topic_id FROM assignments WHERE id=? AND supervisor_id=?',
      [id, supervisorId]
    );
    if (!a) return res.status(404).json({ message: 'Assignment not found' });
    if (!['under_assignment','active'].includes(a.status)) {
      return res.status(400).json({ message: 'Cancel allowed only for under_assignment or active' });
    }

    const [[g]] = await pool.query('SELECT COUNT(*) AS c FROM grades WHERE assignment_id=?', [id]);
    if (g.c > 0) return res.status(400).json({ message: 'Cannot cancel: grades already exist' });

    await pool.query(
      'UPDATE assignments SET `status`="canceled", canceled_at=NOW(), cancel_reason=? WHERE id=?',
      [reason || 'Canceled by supervisor', id]
    );

    // ακύρωσε pending προσκλήσεις τριμελούς (δεν μπλοκάρει αν αποτύχει)
    try {
      await pool.query(
        'UPDATE invitations SET status="canceled", responded_at=NOW() WHERE assignment_id=? AND status="pending"',
        [id]
      );
    } catch (e) {
      console.warn('Invitations cancel skipped:', e.sqlMessage || e.message);
    }

    // ⚠️ ΔΕΝ πειράζουμε topics (δεν υπάρχει topics.status)
    return res.json({ ok: true });
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
  const { status } = req.query; // role δεν χρησιμοποιείται εδώ προς το παρόν

  let sql = `
    SELECT 
      a.id,
      a.status,
      a.created_at,
      t.title,
      stu.username AS student,
      COALESCE(sup.full_name, sup.username) AS supervisor
    FROM assignments a
    JOIN topics t      ON a.topic_id      = t.id
    JOIN users  stu    ON a.student_id    = stu.id
    JOIN users  sup    ON a.supervisor_id = sup.id
    WHERE a.supervisor_id = ?`;
  const params = [supervisorId];

  if (status) { 
    sql += ' AND a.status = ?';
    params.push(status);
  }

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

  if (!invitation_id || !['accept','reject'].includes(action)) {
    return res.status(400).json({ message: 'invitation_id & action required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Φέρε την πρόσκληση (πρέπει να είναι pending και να ανήκει στον teacher)
    const [[inv]] = await conn.query(
      `SELECT id, assignment_id, status
         FROM invitations
        WHERE id=? AND invitee_id=? FOR UPDATE`,
      [invitation_id, teacherId]
    );
    if (!inv) {
      await conn.rollback();
      return res.status(404).json({ message: 'Invitation not found' });
    }
    if (inv.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ message: 'Invitation is not pending' });
    }

    // 2) Κάνε update την πρόσκληση
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const [upd] = await conn.query(
      `UPDATE invitations
          SET status=?, responded_at=NOW()
        WHERE id=? AND invitee_id=? AND status='pending'`,
      [newStatus, invitation_id, teacherId]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return res.status(400).json({ message: 'Δεν ενημερώθηκε' });
    }

    // 3) Αν έγινε "accept": δες αν έχουμε ήδη 2 accepted ⇒ ενεργοποίηση ανάθεσης & ακύρωση λοιπών pending
    if (newStatus === 'accepted') {
      const [[cnt]] = await conn.query(
        `SELECT COUNT(*) AS accepted_count
           FROM invitations
          WHERE assignment_id=? AND status='accepted'`,
        [inv.assignment_id]
      );

      if (cnt.accepted_count >= 2) {
        // ενεργοποίηση ανάθεσης αν ήταν under_assignment
        await conn.query(
          `UPDATE assignments
              SET status='active'
            WHERE id=? AND status='under_assignment'`,
          [inv.assignment_id]
        );

        // ακύρωση τυχόν υπόλοιπων pending
        await conn.query(
          `UPDATE invitations
              SET status='canceled', responded_at=NOW()
            WHERE assignment_id=? AND status='pending'`,
          [inv.assignment_id]
        );
      }
    }

    await conn.commit();
    return res.json({ ok: true, status: newStatus });
  } catch (e) {
    await conn.rollback();
    console.error('respondInvitation error:', e);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
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


///
async function assertSupervisor(teacherId, assignmentId) {
  const [[row]] = await pool.query(
    'SELECT id, status, finalized_at FROM assignments WHERE id=? AND supervisor_id=?',
    [assignmentId, teacherId]
  );
  if (!row) { const e=new Error('Not found or not supervisor'); e.status=404; throw e; }
  return row;
}
async function assertParticipant(teacherId, assignmentId) {
  const [[row]] = await pool.query(`
    SELECT a.id, a.status
    FROM assignments a
    LEFT JOIN invitations i ON i.assignment_id=a.id AND i.invitee_id=?
    WHERE a.id=? AND (a.supervisor_id=? OR i.id IS NOT NULL)
  `, [teacherId, assignmentId, teacherId]);
  if (!row) { const e=new Error('Not found or not participant'); e.status=404; throw e; }
  return row;
}

/* ---------- Υπό Ανάθεση ---------- */
async function listInvitationsForAssignment(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    const asg=await assertSupervisor(teacherId,id);
    const [rows]=await pool.query(`
      SELECT i.id, i.status, i.invited_at, i.responded_at,
             u.id AS teacher_id, u.full_name, u.username, u.email
      FROM invitations i
      JOIN users u ON u.id=i.invitee_id
      WHERE i.assignment_id=?
      ORDER BY i.invited_at DESC`, [id]);
    res.json({ assignment_id: asg.id, status: asg.status, invitations: rows });
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}

async function cancelAssignment2(req,res){;
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    const { council_number, council_year } = req.body || {};
    const asg = await assertSupervisor(teacherId,id);

    await conn.beginTransaction();

    if (asg.status === 'under_assignment') {
      await conn.query(
        `UPDATE assignments
            SET status='canceled', canceled_at=NOW(), canceled_reason='Canceled by supervisor (under_assignment)'
          WHERE id=?`, [id]);
      await conn.query(
        `UPDATE invitations
            SET status='canceled', responded_at=NOW()
          WHERE assignment_id=? AND status='pending'`, [id]);
      await conn.commit();
      return res.json({ ok:true });
    }

    if (asg.status === 'active') {
      if (!asg.finalized_at) { await conn.rollback(); return res.status(400).json({message:'No finalized_at set'}); }
      const [[{diff_days}]] = await conn.query('SELECT TIMESTAMPDIFF(DAY, ?, NOW()) AS diff_days',[asg.finalized_at]);
      if (diff_days < 365*2) { await conn.rollback(); return res.status(400).json({message:'Needs 2 years after finalized_at'}); }
      if (!council_number || !council_year) { await conn.rollback(); return res.status(400).json({message:'council_number & council_year required'}); }

      await conn.query(
        `UPDATE assignments
            SET status='canceled', canceled_at=NOW(),
                canceled_reason='Canceled by supervisor', council_number=?, council_year=?
          WHERE id=?`, [council_number, council_year, id]);
      await conn.query(
        `UPDATE invitations
            SET status='canceled', responded_at=NOW()
          WHERE assignment_id=? AND status='pending'`, [id]);
      await conn.commit();
      return res.json({ ok:true });
    }

    await conn.rollback();
    res.status(400).json({message:'Cancel allowed only for under_assignment or active'});
  }catch(e){
    await conn.rollback();
    res.status(500).json({message:'Server error'});
  }finally{ conn.release(); }
}

/* ---------- Ενεργή ---------- */
async function listNotes(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    await assertParticipant(teacherId,id);
    const [rows]=await pool.query(
      'SELECT id, body, created_at FROM teacher_notes WHERE assignment_id=? AND author_id=? ORDER BY created_at DESC',
      [id, teacherId]);
    res.json(rows);
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}
async function addNote(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    const { body } = req.body||{};
    if (!body || body.length>300) return res.status(400).json({message:'Note 1..300 chars'});
    await assertParticipant(teacherId,id);
    await pool.query('INSERT INTO teacher_notes (assignment_id, author_id, body) VALUES (?,?,?)',[id,teacherId,body]);
    res.status(201).json({ok:true});
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}
async function moveToUnderReview(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    const asg=await assertSupervisor(teacherId,id);
    if (asg.status!=='active') return res.status(400).json({message:'Only active → under_review'});
    await pool.query('UPDATE assignments SET status="under_review" WHERE id=?',[id]);
    res.json({ok:true});
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}

/* ---------- Υπό Εξέταση ---------- */
async function getDraft(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    const asg=await assertParticipant(teacherId,id);
    if (!['under_review','completed'].includes(asg.status)) return res.status(400).json({message:'Draft visible only in under_review or completed'});
    const [[row]] = await pool.query('SELECT draft_url, extra_links_json FROM assignments WHERE id=?',[id]);
    res.json({ draft_url: row?.draft_url||null, links: row?.extra_links_json ? JSON.parse(row.extra_links_json) : [] });
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}
async function buildAnnouncement(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    await assertParticipant(teacherId,id);
    const [[row]] = await pool.query(`
      SELECT a.exam_datetime, a.exam_mode, a.exam_room, a.meeting_url,
             t.title, u.full_name AS student_name, u.username AS student_username
      FROM assignments a
      JOIN topics t ON t.id=a.topic_id
      JOIN users  u ON u.id=a.student_id
      WHERE a.id=?`, [id]);
    if (!row?.exam_datetime) return res.status(400).json({message:'Exam details are missing'});
    const when = new Date(row.exam_datetime).toLocaleString();
    const where = row.exam_mode==='in_person' ? `Αίθουσα: ${row.exam_room||'—'}` : `Σύνδεσμος: ${row.meeting_url||'—'}`;
    const html = `
      <h3>Παρουσίαση Διπλωματικής</h3>
      <p><strong>Θέμα:</strong> ${row.title}</p>
      <p><strong>Φοιτητής:</strong> ${row.student_name || row.student_username}</p>
      <p><strong>Ημερομηνία/Ώρα:</strong> ${when}</p>
      <p><strong>Τρόπος:</strong> ${row.exam_mode || '—'} — ${where}</p>
    `.trim();
    res.set('Content-Type','text/html; charset=utf-8'); res.send(html);
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}
async function enableGrading(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    const { enabled } = req.body||{};
    await assertSupervisor(teacherId,id);
    await pool.query('UPDATE assignments SET grading_enabled=? WHERE id=?',[enabled?1:0,id]);
    res.json({ok:true});
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}
async function submitGrade(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    const { total, criteria } = req.body||{};
    const asg=await assertParticipant(teacherId,id);
    if (asg.status!=='under_review') return res.status(400).json({message:'Grading only in under_review'});
    const [[{grading_enabled}]] = await pool.query('SELECT grading_enabled FROM assignments WHERE id=?',[id]);
    if (!grading_enabled) return res.status(400).json({message:'Grading not enabled by supervisor'});
    if (total==null) return res.status(400).json({message:'total required'});
    await pool.query(`
      INSERT INTO grades (assignment_id, grader_id, total, created_at, criteria_json)
      VALUES (?, ?, ?, NOW(), ?)
      ON DUPLICATE KEY UPDATE total=VALUES(total), criteria_json=VALUES(criteria_json), created_at=NOW()
    `,[id,teacherId,Number(total), criteria?JSON.stringify(criteria):null]);
    res.status(201).json({ok:true});
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}
async function listGrades(req,res){
  try{
    const teacherId=req.session.user.id;
    const id=Number(req.params.id);
    await assertParticipant(teacherId,id);
    const [rows]=await pool.query(`
      SELECT g.grader_id, u.full_name AS grader_name, g.total, g.created_at, g.criteria_json
      FROM grades g JOIN users u ON u.id=g.grader_id
      WHERE g.assignment_id=?`,[id]);
    res.json(rows.map(r=>({
      grader_id:r.grader_id,
      grader_name:r.grader_name,
      total:Number(r.total),
      created_at:r.created_at,
      criteria:r.criteria_json?JSON.parse(r.criteria_json):null
    })));
  }catch(e){ res.status(e.status||500).json({message:e.message||'Server error'}); }
}





module.exports = {
  listTopics, createTopic, assignTopic, updateTopic, listAssignments,cancelAssignment,
  listInvitations, respondInvitation, stats, exportTheses, confirmAssignment, requestReview, listMyTheses,  listInvitationsForAssignment,
  cancelAssignment2,
  listNotes, addNote, moveToUnderReview,
  getDraft, buildAnnouncement,
  enableGrading, submitGrade, listGrades,
  
};
