const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/leaveController');

const router = express.Router();

router.use(requireAuth);

router.get('/balance', ctrl.balance);
router.get('/report', ctrl.report);
router.get('/requests/mine', ctrl.mine);
router.get('/requests', requireRole('superadmin', 'hr', 'manager'), ctrl.list);
router.get('/requests/:id', ctrl.getOne);
router.post('/requests', ctrl.create);
router.patch('/requests/:id/approve', ctrl.approve);
router.patch('/requests/:id/reject', ctrl.reject);
router.patch('/requests/:id/hold', ctrl.hold);
router.post('/requests/:id/comments', ctrl.addComment);
router.patch('/requests/:id/cancel', ctrl.cancel);

module.exports = router;
