const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/documentController');

const router = express.Router();

router.use(requireAuth);

router.get('/requests/mine', ctrl.myRequests);
router.get('/requests', requireRole('superadmin', 'hr'), ctrl.listRequests);
router.post('/requests', ctrl.createRequest);
router.patch('/requests/:id/fulfill', requireRole('superadmin', 'hr'), ctrl.fulfillRequest);
router.patch('/requests/:id/reject', requireRole('superadmin', 'hr'), ctrl.rejectRequest);
router.patch('/requests/:id/cancel', ctrl.cancelRequest);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.upload);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
