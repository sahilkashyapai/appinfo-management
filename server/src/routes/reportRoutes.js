const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/reportController');

const router = express.Router();

router.use(requireAuth);

router.get('/summary', ctrl.summary);
router.get('/birthdays-by-department', ctrl.birthdaysByDepartment);
router.get('/event-type-distribution', ctrl.eventTypeDistribution);
router.get('/birthday-report', ctrl.birthdayReport);

module.exports = router;
