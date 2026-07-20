const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/profileController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.getProfile);
router.put('/', ctrl.updateProfile);

module.exports = router;
