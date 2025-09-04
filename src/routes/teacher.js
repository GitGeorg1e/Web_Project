const router = require('express').Router();
const { listTopics, createTopic, assignTopic, listAssignments, listInvitations, respondInvitation, stats, exportTheses } = require('../controllers/teacherController');
const { ensureAuth, requireRole } = require('../middleware/auth');

router.use(ensureAuth, requireRole('teacher','admin'));
router.get('/topics', listTopics);
router.post('/topics', createTopic);
router.post('/assign', assignTopic);
router.get('/assignments', listAssignments);
router.get('/invitations', listInvitations);
router.post('/invitations/respond', respondInvitation);
router.get('/stats', stats);
router.get('/theses/export', exportTheses);

module.exports = router;
