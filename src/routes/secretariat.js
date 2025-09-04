const router = require('express').Router();
const { listActiveAndReview, importUsers } = require('../controllers/secretariatController');
const { ensureAuth, requireRole } = require('../middleware/auth');

router.use(ensureAuth, requireRole('secretariat','admin'));
router.get('/theses', listActiveAndReview);
router.post('/import', importUsers);

module.exports = router;
