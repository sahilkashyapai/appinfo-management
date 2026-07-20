const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/attendanceController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/today', ctrl.today);
router.get('/export.pdf', requireRole('superadmin', 'hr'), ctrl.exportPdf);
router.post('/', requireRole('superadmin', 'hr'), ctrl.upsert);
router.post('/bulk', requireRole('superadmin', 'hr'), ctrl.bulkUpsert);
router.delete('/:id', requireRole('superadmin', 'hr'), ctrl.remove);

module.exports = router;
