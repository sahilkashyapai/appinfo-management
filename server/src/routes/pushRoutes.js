const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/pushController');

const router = express.Router();

router.use(requireAuth);

router.get('/public-key', ctrl.getPublicKey);
router.post('/subscribe', ctrl.subscribe);
router.post('/unsubscribe', ctrl.unsubscribe);

module.exports = router;
