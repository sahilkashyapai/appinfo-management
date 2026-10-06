const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/demoDataController');

const router = express.Router();

router.get('/', requireAuth, requireRole('superadmin'), ctrl.status);
router.delete('/', requireAuth, requireRole('superadmin'), ctrl.clearAll);

module.exports = router;
