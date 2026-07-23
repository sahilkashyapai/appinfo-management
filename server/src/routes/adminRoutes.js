const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../utils/roles');
const ctrl = require('../controllers/adminController');

const router = express.Router();

router.use(requireAuth);

router.get('/', requireRole(...ADMIN_ROLES), ctrl.list);
router.post('/', requireRole('superadmin'), ctrl.create);
router.put('/:id', requireRole(...ADMIN_ROLES), ctrl.update);
router.delete('/:id', requireRole('superadmin'), ctrl.remove);

module.exports = router;
