const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/settingsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.get);
router.put('/notifications', requireRole('superadmin', 'hr'), ctrl.updateNotifications);
router.put('/integrations', requireRole('superadmin', 'hr'), ctrl.updateIntegrations);
router.put('/smtp', requireRole('superadmin'), ctrl.updateSmtp);
router.put('/security', requireRole('superadmin'), ctrl.updateSecurity);
router.post('/test-email', requireRole('superadmin'), ctrl.sendTestEmail);

module.exports = router;
