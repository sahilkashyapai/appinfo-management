const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/jobApplicationController');

const router = express.Router();

// Public — the candidate-facing application form uses this, no login involved.
router.post('/', ctrl.apply);

// Any signed-in employee can refer a candidate — not just admins.
router.post('/refer', requireAuth, ctrl.submitReferral);

// Any signed-in employee can see the status of candidates they referred, and
// edit/withdraw their own referral while it's still unreviewed.
router.get('/my-referrals', requireAuth, ctrl.myReferrals);
router.patch('/:id/referral', requireAuth, ctrl.updateReferral);
router.delete('/:id/referral', requireAuth, ctrl.deleteReferral);

router.use(requireAuth, requireRole('superadmin', 'hr'));

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.patch('/:id', ctrl.updateStatus);
router.delete('/:id', ctrl.remove);

module.exports = router;
