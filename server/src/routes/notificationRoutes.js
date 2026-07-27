const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.patch('/:id/read', ctrl.markRead);
router.patch('/read-all', ctrl.markAllRead);
router.delete('/clear-all', ctrl.clearAll);

module.exports = router;
