const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/profileController');
const bank = require('../controllers/bankDetailsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.getProfile);
router.put('/', ctrl.updateProfile);
// Own PAN/bank details: saved once, then changed only via a request to HR.
router.get('/bank-details', bank.mine);
router.put('/bank-details', bank.saveMine);
router.post('/bank-details/requests', bank.requestChange);

module.exports = router;
