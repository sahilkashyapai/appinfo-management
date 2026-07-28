const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/settingsController');

const router = express.Router();

// Public — pre-login screens (login/signup/apply) and the sidebar need the
// company name/logo/favicon before there's a session to authenticate.
router.get('/branding', ctrl.getBranding);

router.use(requireAuth);

router.get('/', ctrl.get);
router.put('/branding', requireRole('proadmin', 'developer'), ctrl.updateBranding);
router.put('/notifications', ctrl.updateNotifications);
router.put('/integrations', requireRole('superadmin', 'admin'), ctrl.updateIntegrations);
router.put('/smtp', requireRole('superadmin'), ctrl.updateSmtp);
router.put('/security', requireRole('superadmin'), ctrl.updateSecurity);
router.put('/timeTracking', requireRole('superadmin'), ctrl.updateTimeTracking);
router.put('/leavePolicy', requireRole('superadmin', 'admin'), ctrl.updateLeavePolicy);
router.post('/test-email', requireRole('superadmin'), ctrl.sendTestEmail);

module.exports = router;
