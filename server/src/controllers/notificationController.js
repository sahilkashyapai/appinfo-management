const Notification = require('../models/Notification');

function shape(n, userId) {
  const obj = n.toObject();
  const isBroadcast = !obj.recipientRef;
  obj.unread = isBroadcast ? !obj.readBy.some((id) => String(id) === String(userId)) : !obj.isRead;
  delete obj.readBy;
  return obj;
}

async function list(req, res) {
  const notifs = await Notification.find({
    $or: [{ recipientRef: req.user._id }, { recipientRef: null }],
  })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ items: notifs.map((n) => shape(n, req.user._id)) });
}

async function unreadCount(req, res) {
  const notifs = await Notification.find({ $or: [{ recipientRef: req.user._id }, { recipientRef: null }] });
  const count = notifs.filter((n) => shape(n, req.user._id).unread).length;
  res.json({ count });
}

async function markRead(req, res) {
  const n = await Notification.findById(req.params.id);
  if (!n) return res.status(404).json({ message: 'Notification not found.' });

  if (n.recipientRef) {
    if (String(n.recipientRef) !== String(req.user._id)) return res.status(403).json({ message: 'Not your notification.' });
    n.isRead = true;
  } else if (!n.readBy.some((id) => String(id) === String(req.user._id))) {
    n.readBy.push(req.user._id);
  }
  await n.save();
  res.json({ notification: shape(n, req.user._id) });
}

async function markAllRead(req, res) {
  const notifs = await Notification.find({ $or: [{ recipientRef: req.user._id }, { recipientRef: null }] });
  await Promise.all(
    notifs.map((n) => {
      if (n.recipientRef) n.isRead = true;
      else if (!n.readBy.some((id) => String(id) === String(req.user._id))) n.readBy.push(req.user._id);
      return n.save();
    })
  );
  res.json({ message: 'All notifications marked as read.' });
}

module.exports = { list, unreadCount, markRead, markAllRead };
