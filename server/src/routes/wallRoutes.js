const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/wallController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/:id/react', ctrl.react);
router.post('/:id/comments', ctrl.addComment);
router.delete('/:id', ctrl.remove);

module.exports = router;
