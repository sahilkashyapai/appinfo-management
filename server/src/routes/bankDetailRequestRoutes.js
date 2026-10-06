const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/bankDetailsController');

const router = express.Router();

// HR decides employees' requests to change locked bank/PAN details.
router.use(requireAuth, requireRole('superadmin', 'admin'));

router.get('/', ctrl.listRequests);
router.patch('/:id', ctrl.decide);

module.exports = router;
