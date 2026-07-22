const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/employeeController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/next-emp-id', requireRole('superadmin', 'hr'), ctrl.nextId);
router.get('/org-chart', ctrl.orgChart);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('superadmin', 'hr'), ctrl.create);
router.put('/:id', requireRole('superadmin', 'hr'), ctrl.update);
router.patch('/:id/status', requireRole('superadmin', 'hr'), ctrl.setStatus);
router.delete('/:id', requireRole('superadmin'), ctrl.remove);

module.exports = router;
