const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/documentController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('superadmin', 'hr', 'manager'), ctrl.upload);
router.delete('/:id', requireRole('superadmin', 'hr', 'manager'), ctrl.remove);

module.exports = router;
