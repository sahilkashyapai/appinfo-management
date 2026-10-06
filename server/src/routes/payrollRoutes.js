const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/payrollController');

const router = express.Router();

// HR only (admin/superadmin; proadmin passes every requireRole). Employees get
// their published slips through Documents, never through these routes.
router.use(requireAuth, requireRole('superadmin', 'admin'));

router.get('/settings', ctrl.getPayrollSettings);
router.put('/settings', ctrl.updatePayrollSettings);

router.get('/structures', ctrl.listStructures);
router.get('/structures/:employeeId', ctrl.getStructure);
router.put('/structures/:employeeId', ctrl.saveStructure);
router.delete('/structures/:employeeId', ctrl.deleteStructure);

router.get('/slips', ctrl.listSlips);
router.post('/slips/generate', ctrl.generate);
router.post('/slips/publish', ctrl.publishAll);
router.get('/slips/:id', ctrl.getSlip);
router.put('/slips/:id', ctrl.updateSlip);
router.post('/slips/:id/recalculate', ctrl.recalculateSlip);
router.post('/slips/:id/publish', ctrl.publishSlip);
router.post('/slips/:id/unpublish', ctrl.unpublishSlip);
router.get('/slips/:id/pdf', ctrl.slipPdf);
router.delete('/slips/:id', ctrl.deleteSlip);

module.exports = router;
