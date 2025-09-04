const router = require('express').Router();
const { myThesis, updateProfile } = require('../controllers/studentController');
const { ensureAuth, requireRole } = require('../middleware/auth');

router.use(ensureAuth, requireRole('student','admin'));
router.get('/thesis', myThesis);
router.post('/profile', updateProfile);

module.exports = router;
