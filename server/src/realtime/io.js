const { Server } = require('socket.io');
const { verifyToken } = require('../utils/token');
const User = require('../models/User');

let io = null;

// Each connected socket joins a room named after its user id, so emitting to a
// user (possibly across several open tabs/devices) is just io.to(userId).
function initSocket(httpServer, corsOrigin) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Not authenticated.'));
      const payload = verifyToken(token);
      if (payload.stage !== 'full') return next(new Error('Not authenticated.'));
      const user = await User.findById(payload.sub);
      if (!user || !user.isActive) return next(new Error('Not authenticated.'));
      socket.userId = String(user._id);
      next();
    } catch (err) {
      next(new Error('Invalid or expired session.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.userId);
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(String(userId)).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  if (!io) return;
  userIds.forEach((id) => io.to(String(id)).emit(event, payload));
}

module.exports = { initSocket, emitToUser, emitToUsers };
