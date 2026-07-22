const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/assetController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', requireRole('superadmin', 'hr', 'manager'), ctrl.create);
router.patch('/:id/assign', requireRole('superadmin', 'hr', 'manager'), ctrl.assign);
router.patch('/:id/status', requireRole('superadmin', 'hr', 'manager'), ctrl.updateStatus);
router.delete('/:id', requireRole('superadmin', 'hr'), ctrl.remove);

module.exports = router;
