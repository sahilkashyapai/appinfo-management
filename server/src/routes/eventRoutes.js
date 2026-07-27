const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/eventController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/rsvps', ctrl.listRsvps);
router.post('/', requireRole('superadmin', 'admin'), ctrl.create);
router.put('/:id', requireRole('superadmin', 'admin'), ctrl.update);
router.patch('/:id/publish', requireRole('superadmin', 'admin'), ctrl.publish);
router.delete('/:id', requireRole('superadmin', 'admin'), ctrl.remove);
router.post('/:id/rsvp', ctrl.rsvp);

module.exports = router;
