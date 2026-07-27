const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/attendanceController');

const router = express.Router();

router.use(requireAuth);

router.get('/my-summary', ctrl.mySummary);
router.get('/corrections/mine', ctrl.myCorrectionRequests);
router.get('/corrections', requireRole('superadmin', 'admin'), ctrl.listCorrectionRequests);
router.post('/corrections', ctrl.createCorrectionRequest);
router.patch('/corrections/:id/approve', requireRole('superadmin', 'admin'), ctrl.approveCorrectionRequest);
router.patch('/corrections/:id/reject', requireRole('superadmin', 'admin'), ctrl.rejectCorrectionRequest);

router.get('/', ctrl.list);
router.get('/today', ctrl.today);
router.get('/today-list', ctrl.todayByStatus);
router.get('/today-breakdown', ctrl.todayBreakdown);
router.get('/export.pdf', requireRole('superadmin', 'admin'), ctrl.exportPdf);
router.post('/', requireRole('superadmin', 'admin'), ctrl.upsert);
router.post('/bulk', requireRole('superadmin', 'admin'), ctrl.bulkUpsert);
router.delete('/:id', requireRole('superadmin', 'admin'), ctrl.remove);

module.exports = router;
