const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

const router = express.Router();

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/2fa/verify', ctrl.verify2fa);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);

router.get('/me', requireAuth, ctrl.me);
router.post('/change-password', requireAuth, ctrl.changePassword);
router.post('/2fa/setup', requireAuth, ctrl.setup2fa);
router.post('/2fa/enable', requireAuth, ctrl.enable2fa);
router.post('/2fa/disable', requireAuth, ctrl.disable2fa);

module.exports = router;
