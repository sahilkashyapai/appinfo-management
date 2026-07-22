const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/timeTrackingController');

const router = express.Router();

router.use(requireAuth);

router.get('/me/today', ctrl.myToday);
router.post('/start', ctrl.start);
router.post('/pause', ctrl.pause);
router.post('/resume', ctrl.resume);
router.post('/stop', ctrl.stop);

router.get('/today', requireRole('superadmin', 'hr', 'manager'), ctrl.today);
router.get('/', requireRole('superadmin', 'hr', 'manager'), ctrl.list);
router.delete('/all', requireRole('superadmin'), ctrl.clearAll);
router.delete('/', requireRole('superadmin'), ctrl.clear);

module.exports = router;
