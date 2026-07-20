const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/searchController');

const router = express.Router();

router.get('/', requireAuth, ctrl.search);

module.exports = router;
