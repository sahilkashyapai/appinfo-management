const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/wallController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/react', ctrl.react);
router.post('/:id/poll/vote', ctrl.votePoll);
router.post('/:id/comments', ctrl.addComment);
router.put('/:id/comments/:commentId', ctrl.editComment);
router.delete('/:id/comments/:commentId', ctrl.deleteComment);
router.delete('/:id', ctrl.remove);

module.exports = router;
