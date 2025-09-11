// src/routes/student.js
const router = require('express').Router();
const { ensureAuth, requireRole } = require('../middleware/auth');
const {
  myThesis, updateProfile,
  inviteTeacher, listCommittee, cancelInvite,
  updateDraft, updateExam, setRepository, viewReportHtml
} = require('../controllers/studentController');

// προστασία για όλα τα παρακάτω endpoints
router.use(ensureAuth, requireRole('student','admin'));

// Υπάρχοντα
router.get('/thesis', myThesis);
router.post('/profile', updateProfile);

// Επιλογή/διαχείριση τριμελούς
router.post('/committee/invite', inviteTeacher);             // body: { assignment_id, invitee_id }
router.get('/committee',        listCommittee);              // ?assignment_id=...
router.delete('/committee/invite/:id', cancelInvite);       // :id = invitation id

// Υλικό / Εξέταση / Repository
router.post('/assignment/:id/draft',      updateDraft);     // body: { draft_url, links:[...] }
router.post('/assignment/:id/exam',       updateExam);      // body: { exam_datetime, exam_mode, exam_room, meeting_url }
router.post('/assignment/:id/repository', setRepository);   // body: { repository_url }

// Πρακτικό (HTML)
router.get('/assignment/:id/report',      viewReportHtml);

module.exports = router;
