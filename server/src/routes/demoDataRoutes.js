const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/demoDataController');

const router = express.Router();

router.delete('/', requireAuth, requireRole('superadmin'), ctrl.clearAll);

module.exports = router;
