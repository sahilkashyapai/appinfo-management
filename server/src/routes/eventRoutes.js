const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/eventController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/rsvps', ctrl.listRsvps);
router.post('/', requireRole('superadmin', 'hr'), ctrl.create);
router.put('/:id', requireRole('superadmin', 'hr'), ctrl.update);
router.patch('/:id/publish', requireRole('superadmin', 'hr'), ctrl.publish);
router.delete('/:id', requireRole('superadmin', 'hr'), ctrl.remove);
router.post('/:id/rsvp', ctrl.rsvp);

module.exports = router;
