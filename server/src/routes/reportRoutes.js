const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../utils/roles');
const ctrl = require('../controllers/reportController');

const router = express.Router();

router.use(requireAuth);

// Company-wide aggregates — admins only.
router.get('/summary', requireRole(...ADMIN_ROLES), ctrl.summary);
router.get('/birthdays-by-department', requireRole(...ADMIN_ROLES), ctrl.birthdaysByDepartment);
router.get('/event-type-distribution', requireRole(...ADMIN_ROLES), ctrl.eventTypeDistribution);

// Per-employee reports — any authenticated user, but non-admins are always
// scoped to their own record inside the controller (see resolveEmployeeScope).
router.get('/leave-report', ctrl.leaveReport);
router.get('/absent-report', ctrl.absentReport);
router.get('/work-mode-report', ctrl.workModeReport);
router.get('/attendance-report', ctrl.attendanceReport);

module.exports = router;
