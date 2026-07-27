const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/holidayController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', requireRole('superadmin', 'admin'), ctrl.create);
router.put('/:id', requireRole('superadmin', 'admin'), ctrl.update);
router.delete('/:id', requireRole('superadmin', 'admin'), ctrl.remove);

module.exports = router;
