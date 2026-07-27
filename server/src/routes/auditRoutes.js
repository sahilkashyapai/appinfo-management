const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/auditController');

const router = express.Router();

router.use(requireAuth, requireRole('superadmin', 'admin'));

router.get('/', ctrl.list);
router.get('/export.csv', ctrl.exportCsv);

module.exports = router;
