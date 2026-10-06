const prisma = require('./prisma');
const { shape, shapeMany, sel } = require('./shape');

// Includes that rebuild the old embedded arrays. Use these whenever a response
// needs the array fields (comments, reactions, poll, members, readBy, ...), so
// shape() can fold the child rows back into the Mongo-era JSON.
const INCLUDE = {
  WallPost: {
    comments: { orderBy: { createdAt: 'asc' } },
    reactions: { select: { type: true, userId: true } },
    pollOptions: { orderBy: { position: 'asc' }, include: { votes: { select: { userId: true } } } },
  },
  Message: {
    attachments: { orderBy: { position: 'asc' } },
    readBy: { select: { userId: true } },
  },
  Conversation: {
    members: { select: { userId: true } },
  },
  Notification: {
    readBy: { select: { userId: true } },
    clearedBy: { select: { userId: true } },
  },
  LeaveRequest: {
    comments: { orderBy: { createdAt: 'asc' } },
  },
};

// Adds one more condition to a Prisma `where` without clobbering existing ones
// on the same field (the Mongo code merged $in/$nin by hand; AND does it for us).
function andWhere(where, condition) {
  if (!condition) return where;
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), condition];
  return where;
}

// Escapes % and _ so user search input matches literally in a LIKE (`contains`).
// MySQL's utf8mb4_unicode_ci collation already makes these case-insensitive,
// which is what the old `new RegExp(q, 'i')` searches did.
function likeSafe(text) {
  return String(text).replace(/[\\%_]/g, (c) => `\\${c}`);
}

module.exports = { prisma, shape, shapeMany, sel, INCLUDE, andWhere, likeSafe };
