const jwt = require('jsonwebtoken');

function signAuthToken(user, sessionTimeoutMins) {
  const expiresIn = sessionTimeoutMins ? `${sessionTimeoutMins}m` : process.env.JWT_EXPIRES_IN || '8h';
  return jwt.sign({ sub: user._id.toString(), role: user.role, stage: 'full' }, process.env.JWT_SECRET, {
    expiresIn,
  });
}

function signTwoFactorChallengeToken(user) {
  return jwt.sign({ sub: user._id.toString(), stage: '2fa_pending' }, process.env.JWT_SECRET, {
    expiresIn: '5m',
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signAuthToken, signTwoFactorChallengeToken, verifyToken };
