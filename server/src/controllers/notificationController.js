const { prisma, shape: shapeRow } = require('../db');

// readBy is only needed to work out this viewer's own unread state, so only
// their row is loaded; clearedBy stays the full list as before.
function notifInclude(userId) {
  return {
    readBy: { where: { userId: String(userId) }, select: { userId: true } },
    clearedBy: { select: { userId: true } },
  };
}

function shape(n, userId) {
  const obj = shapeRow('Notification', n);
  const isBroadcast = !obj.recipientRef;
  obj.unread = isBroadcast ? !obj.readBy.some((id) => String(id) === String(userId)) : !obj.isRead;
  delete obj.readBy;
  return obj;
}

function visibilityFilter(userId) {
  const uid = String(userId);
  return { OR: [{ recipientId: uid }, { recipientId: null, clearedBy: { none: { userId: uid } } }] };
}

async function list(req, res) {
  const notifs = await prisma.notification.findMany({
    where: visibilityFilter(req.user._id),
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: notifInclude(req.user._id),
  });
  res.json({ items: notifs.map((n) => shape(n, req.user._id)) });
}

async function unreadCount(req, res) {
  const uid = String(req.user._id);
  const [personal, broadcast] = await Promise.all([
    prisma.notification.count({ where: { recipientId: uid, isRead: false } }),
    prisma.notification.count({
      where: { recipientId: null, clearedBy: { none: { userId: uid } }, readBy: { none: { userId: uid } } },
    }),
  ]);
  res.json({ count: personal + broadcast });
}

async function markRead(req, res) {
  const uid = String(req.user._id);
  const n = await prisma.notification.findUnique({ where: { id: String(req.params.id) }, select: { id: true, recipientId: true } });
  if (!n) return res.status(404).json({ message: 'Notification not found.' });

  if (n.recipientId) {
    if (String(n.recipientId) !== uid) return res.status(403).json({ message: 'Not your notification.' });
    await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
  } else {
    await prisma.notificationRead.createMany({ data: [{ notificationId: n.id, userId: uid }], skipDuplicates: true });
  }
  const updated = await prisma.notification.findUnique({ where: { id: n.id }, include: notifInclude(uid) });
  res.json({ notification: shape(updated, uid) });
}

async function markAllRead(req, res) {
  const uid = String(req.user._id);
  const unreadBroadcasts = await prisma.notification.findMany({
    where: { recipientId: null, readBy: { none: { userId: uid } } },
    select: { id: true },
  });
  await Promise.all([
    prisma.notification.updateMany({ where: { recipientId: uid, isRead: false }, data: { isRead: true } }),
    unreadBroadcasts.length
      ? prisma.notificationRead.createMany({ data: unreadBroadcasts.map((n) => ({ notificationId: n.id, userId: uid })), skipDuplicates: true })
      : null,
  ]);
  res.json({ message: 'All notifications marked as read.' });
}

// Personal notifications are only ever visible to their one recipient, so
// clearing them means deleting them outright. Broadcasts are shared with
// everyone, so they can't be deleted — clearing just hides them from this
// viewer (a notification_clears row) without affecting anyone else's list.
async function clearAll(req, res) {
  const uid = String(req.user._id);
  const visibleBroadcasts = await prisma.notification.findMany({
    where: { recipientId: null, clearedBy: { none: { userId: uid } } },
    select: { id: true },
  });

  await Promise.all([
    prisma.notification.deleteMany({ where: { recipientId: uid } }),
    visibleBroadcasts.length
      ? prisma.notificationClear.createMany({ data: visibleBroadcasts.map((n) => ({ notificationId: n.id, userId: uid })), skipDuplicates: true })
      : null,
  ]);
  res.json({ message: 'All notifications cleared.' });
}

module.exports = { list, unreadCount, markRead, markAllRead, clearAll };
