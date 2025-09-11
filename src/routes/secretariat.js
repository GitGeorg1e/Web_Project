// src/routes/secretariat.js
const router = require('express').Router();
const { ensureAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/secretariatController');

// Όλα προστατευμένα για ρόλο γραμματείας (ή admin)
router.use(ensureAuth, requireRole('secretariat','admin'));

router.get('/assignments', ctrl.listActiveAndUnderReview);
router.get('/assignments/:id', ctrl.getAssignmentDetails);
router.post('/import-users', ctrl.importUsers);

router.post('/assignments/:id/gs-approval', ctrl.setGsApproval);
router.post('/assignments/:id/cancel',       ctrl.cancelAssignment);
router.post('/assignments/:id/complete',     ctrl.completeIfEligible);

module.exports = router;