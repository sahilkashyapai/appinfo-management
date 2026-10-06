const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/salaryQueryController');

const router = express.Router();

router.use(requireAuth);

// Employees: their own queries about published salary slips.
router.get('/mine', ctrl.mine);
router.post('/', ctrl.create);

// HR (office-scoped in the controller).
router.get('/', requireRole('superadmin', 'admin'), ctrl.list);
router.patch('/:id', requireRole('superadmin', 'admin'), ctrl.respond);

module.exports = router;
