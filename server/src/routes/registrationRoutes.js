const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/registrationController');

const router = express.Router();

router.use(requireAuth, requireRole('superadmin', 'hr'));

router.get('/', ctrl.list);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);

module.exports = router;
