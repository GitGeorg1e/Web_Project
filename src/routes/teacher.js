const router = require('express').Router();
const { listTopics, createTopic, assignTopic, updateTopic, listAssignments, listInvitations, respondInvitation, stats, exportTheses, confirmAssignment, requestReview, cancelAssignment, listMyTheses } = require('../controllers/teacherController');
const { ensureAuth, requireRole } = require('../middleware/auth');
const { uploadTopicPdf } = require('../middleware/upload');

//
const ctrl = require('../controllers/teacherController');




router.use(ensureAuth, requireRole('teacher','admin'));
router.get('/topics', listTopics);
router.post('/topics', uploadTopicPdf.single('pdf'), createTopic);
router.put('/topics/:id', uploadTopicPdf.single('pdf'), updateTopic);
//router.post('/topics', createTopic);
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
router.get('/invitations', listInvitations);
router.post('/invitations/respond', respondInvitation);
router.get('/stats', stats);
router.get('/theses/export', exportTheses);
router.get('/ping', (req,res)=>res.json({ok:true, route:'teacher'}));
router.post('/assignments/:id/cancel', cancelAssignment);
router.get('/my-theses', listMyTheses);


//
router.get('/assignments/:id/invitations', ctrl.listInvitationsForAssignment);
router.post('/assignments/:id/cancel',      ctrl.cancelAssignment);

/* ΕΝΕΡΓΗ */
router.get('/assignments/:id/notes',  ctrl.listNotes);
router.post('/assignments/:id/notes', ctrl.addNote);
router.post('/assignments/:id/move-under-review', ctrl.moveToUnderReview);

/* ΥΠΟ ΕΞΕΤΑΣΗ */
router.get('/assignments/:id/draft',        ctrl.getDraft);
router.get('/assignments/:id/announcement', ctrl.buildAnnouncement);
router.post('/assignments/:id/grading/enable', ctrl.enableGrading);
router.post('/assignments/:id/grades',      ctrl.submitGrade);
router.get('/assignments/:id/grades',       ctrl.listGrades);

/* ήδη υπαρκτο: λίστα όλων των ΔΕ που συμμετέχει */
router.get('/my-theses', ctrl.listMyTheses);


module.exports = router;
