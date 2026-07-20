const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/chatController');

const router = express.Router();

router.use(requireAuth);

router.get('/users', ctrl.listUsers);
router.get('/conversations', ctrl.listConversations);
router.post('/conversations', ctrl.createConversation);
router.patch('/conversations/:id', ctrl.updateConversation);
router.get('/conversations/:id/messages', ctrl.getMessages);
router.post('/conversations/:id/messages', ctrl.sendMessage);
router.patch('/conversations/:id/read', ctrl.markRead);

module.exports = router;
