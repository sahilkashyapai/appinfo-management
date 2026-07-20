const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/dashboardController');

const router = express.Router();

router.get('/summary', requireAuth, ctrl.summary);

module.exports = router;
