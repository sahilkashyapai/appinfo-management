const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../utils/roles');
const ctrl = require('../controllers/adminController');

const router = express.Router();

router.use(requireAuth);

router.get('/', requireRole('proadmin', ...ADMIN_ROLES), ctrl.list);
router.get('/eligible-employees', requireRole('proadmin', 'superadmin'), ctrl.eligibleEmployees);
router.post('/', requireRole('proadmin', 'superadmin'), ctrl.create);
router.put('/:id', requireRole('proadmin', 'superadmin'), ctrl.update);
router.delete('/:id', requireRole('proadmin', 'superadmin'), ctrl.remove);

module.exports = router;
