const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/assetController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', requireRole('superadmin', 'admin'), ctrl.create);
router.patch('/:id/assign', requireRole('superadmin', 'admin'), ctrl.assign);
router.patch('/:id/status', requireRole('superadmin', 'admin'), ctrl.updateStatus);
router.delete('/:id', requireRole('superadmin', 'admin'), ctrl.remove);

module.exports = router;
