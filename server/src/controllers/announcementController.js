const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const writeAudit = require('../utils/audit');
const { superadminUserIds } = require('../utils/hideSuperadmin');

async function list(req, res) {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  const items = await Announcement.find(filter).populate('postedByRef', 'name').sort({ pinned: -1, createdAt: -1 });

  let shaped = items;
  if (req.user.role !== 'superadmin') {
    const saIds = new Set((await superadminUserIds()).map(String));
    shaped = items.map((a) => {
      if (a.postedByRef && saIds.has(String(a.postedByRef._id))) {
        const obj = a.toObject();
        obj.postedByRef = { ...obj.postedByRef, name: 'Admin' };
        return obj;
      }
      return a;
    });
  }

  res.json({ items: shaped });
}

async function create(req, res) {
  const { title, body, type, priority, icon, pinned, scheduledAt, expiresAt } = req.body;
  if (!title || !body) return res.status(400).json({ message: 'title and body are required.' });
  const isHiring = type === 'hiring';
  const ann = await Announcement.create({
    title,
    body,
    type: isHiring ? 'hiring' : 'general',
    priority: priority || 'medium',
    icon: icon || (isHiring ? '💼' : '📢'),
    pinned: !!pinned,
    postedByRef: req.user._id,
    scheduledAt: scheduledAt || null,
    expiresAt: expiresAt || null,
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'announcements', recordId: ann._id, detail: `Created announcement: ${ann.title}` });

  if (isHiring) {
    await Notification.create({
      recipientRef: null,
      icon: ann.icon,
      bg: '#D5F5E3',
      title: `Hiring Alert: ${ann.title}`,
      body: ann.body,
      type: 'hiring',
      link: '/announcements',
    });
  }

  res.status(201).json({ announcement: ann });
}

async function update(req, res) {
  const ann = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!ann) return res.status(404).json({ message: 'Announcement not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'announcements', recordId: ann._id, detail: `Updated announcement: ${ann.title}` });
  res.json({ announcement: ann });
}

async function remove(req, res) {
  const ann = await Announcement.findByIdAndDelete(req.params.id);
  if (!ann) return res.status(404).json({ message: 'Announcement not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'announcements', recordId: ann._id, detail: `Deleted announcement: ${ann.title}` });
  res.json({ message: 'Announcement deleted.' });
}

module.exports = { list, create, update, remove };
