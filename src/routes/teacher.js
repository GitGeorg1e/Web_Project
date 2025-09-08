const router = require('express').Router();
const { listTopics, createTopic, assignTopic, updateTopic, listAssignments, listInvitations, respondInvitation, stats, exportTheses, confirmAssignment, requestReview } = require('../controllers/teacherController');
const { ensureAuth, requireRole } = require('../middleware/auth');
const { uploadTopicPdf } = require('../middleware/upload');

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

module.exports = router;
