const router = require('express').Router();
const {
  listTopics, createTopic, assignTopic, updateTopic,
  listAssignments, listInvitations, respondInvitation,
  stats, exportTheses, confirmAssignment, requestReview,
  listMyTheses, cancelAssignment2, // <— Χρησιμοποιούμε το 2
  listInvitationsForAssignment, listNotes, addNote,
  moveToUnderReview, getDraft, buildAnnouncement,
  enableGrading, submitGrade, listGrades
} = require('../controllers/teacherController');

const { ensureAuth, requireRole } = require('../middleware/auth');
const { uploadTopicPdf } = require('../middleware/upload');
const ctrl = require('../controllers/teacherController');

router.use(ensureAuth, requireRole('teacher','admin'));

// Topics
router.get('/topics', listTopics);
router.post('/topics', uploadTopicPdf.single('pdf'), createTopic);
router.put('/topics/:id', uploadTopicPdf.single('pdf'), updateTopic);

// Assignments (λίστα / ενέργειες)
router.post('/assign', assignTopic);
router.get('/assignments', listAssignments);
router.post('/assignments/:id/confirm', (req,res,next)=>{ 
  console.log('HIT confirm route id=', req.params.id); 
  next(); 
}, confirmAssignment);
router.post('/assignments/:id/request-review', (req,res,next)=>{ 
  console.log('HIT request-review route id=', req.params.id); 
  next(); 
}, requestReview);

// Invitations
router.get('/invitations', listInvitations);
router.post('/invitations/respond', respondInvitation);

// Stats & Export
router.get('/stats', stats);
router.get('/theses/export', exportTheses);

// My theses (ΜΟΝΟ μία φορά)
router.get('/my-theses', listMyTheses);

// ==== Διαχείριση ανάθεσης (manage) ====

// Υπό Ανάθεση: λίστα προσκλήσεων
router.get('/assignments/:id/invitations', listInvitationsForAssignment);

// Ακύρωση ανάθεσης (under_assignment ή active με Γ.Σ.)
// Χρησιμοποιούμε τη “πλούσια” cancelAssignment2
router.post('/assignments/:id/cancel', cancelAssignment2);

// Ενεργή: σημειώσεις & μετάπτωση
router.get('/assignments/:id/notes',  listNotes);
router.post('/assignments/:id/notes', addNote);
router.post('/assignments/:id/move-under-review', moveToUnderReview);
router.get('/assignments/:id/details', ctrl.getThesisDetails);

// Υπό εξέταση: draft, ανακοίνωση, grading
router.get('/assignments/:id/draft',        getDraft);
router.get('/assignments/:id/announcement', buildAnnouncement);
router.post('/assignments/:id/grading/enable', enableGrading);
router.post('/assignments/:id/grades',      submitGrade);
router.get('/assignments/:id/grades',       listGrades);

module.exports = router;
