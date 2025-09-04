const router = require('express').Router();
const { announcements } = require('../controllers/feedController');
router.get('/announcements', announcements); // δημόσιο endpoint
module.exports = router;
