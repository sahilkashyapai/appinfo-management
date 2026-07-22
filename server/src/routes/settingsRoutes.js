const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/settingsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.get);
router.put('/notifications', ctrl.updateNotifications);
router.put('/integrations', requireRole('superadmin', 'hr'), ctrl.updateIntegrations);
router.put('/smtp', requireRole('superadmin'), ctrl.updateSmtp);
router.put('/security', requireRole('superadmin'), ctrl.updateSecurity);
router.put('/timeTracking', requireRole('superadmin'), ctrl.updateTimeTracking);
router.put('/leavePolicy', requireRole('superadmin', 'hr'), ctrl.updateLeavePolicy);
router.post('/test-email', requireRole('superadmin'), ctrl.sendTestEmail);

module.exports = router;
