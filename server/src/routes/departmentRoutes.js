const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/departmentController');

const router = express.Router();

router.get('/public', ctrl.publicList);

router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', requireRole('superadmin', 'admin'), ctrl.create);
router.put('/:id', requireRole('superadmin', 'admin'), ctrl.update);
router.delete('/:id', requireRole('superadmin'), ctrl.remove);

module.exports = router;
