const { prisma, shape, shapeMany, sel } = require('../db');
const { createNotification } = require('../services/notify');
const writeAudit = require('../utils/audit');

const ANNOUNCEMENT_TYPES = ['general', 'hiring'];

function toDateOrNull(v) {
  return v ? new Date(v) : null;
}

async function list(req, res) {
  const where = {};
  if (req.query.type) {
    // An unknown type simply matched nothing on Mongo; Prisma would reject it.
    if (!ANNOUNCEMENT_TYPES.includes(req.query.type)) return res.json({ items: [] });
    where.type = req.query.type;
  }
  const items = await prisma.announcement.findMany({
    where,
    include: { postedByRef: { select: sel('User', 'name') } },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ items: shapeMany('Announcement', items) });
}

async function create(req, res) {
  const { title, body, type, priority, icon, pinned, scheduledAt, expiresAt } = req.body;
  if (!title || !body) return res.status(400).json({ message: 'title and body are required.' });
  const isHiring = type === 'hiring';
  const row = await prisma.announcement.create({
    data: {
      title: String(title).trim(),
      body: String(body).trim(),
      type: isHiring ? 'hiring' : 'general',
      priority: priority || 'medium',
      icon: icon || (isHiring ? 'fa-solid fa-briefcase' : 'fa-solid fa-bullhorn'),
      pinned: !!pinned,
      postedById: String(req.user._id),
      scheduledAt: toDateOrNull(scheduledAt),
      expiresAt: toDateOrNull(expiresAt),
    },
  });
  const ann = shape('Announcement', row);
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'announcements', recordId: ann._id, detail: `Created announcement: ${ann.title}` });

  if (isHiring) {
    await createNotification({
      recipientId: null,
      icon: ann.icon,
      bg: '#D5F5E3',
      title: `Hiring Alert: ${ann.title}`,
      body: ann.body,
      type: 'hiring',
      link: '/announcements',
    });
  } else if (!ann.scheduledAt || new Date(ann.scheduledAt) <= new Date()) {
    // Scheduled-for-later announcements aren't live yet, so they don't notify now.
    await createNotification({
      recipientId: null,
      icon: ann.icon,
      title: `Announcement: ${ann.title}`,
      body: ann.body,
      type: 'announcement',
      link: '/announcements',
    });
  }

  res.status(201).json({ announcement: ann });
}

// Whitelist of editable columns (Mongo silently ignored unknown body fields).
function updateData(body) {
  const data = {};
  for (const key of ['title', 'body']) if (body[key] !== undefined) data[key] = String(body[key]).trim();
  for (const key of ['type', 'priority', 'icon']) if (body[key] !== undefined) data[key] = body[key];
  if (body.pinned !== undefined) data.pinned = !!body.pinned;
  for (const key of ['scheduledAt', 'expiresAt']) if (body[key] !== undefined) data[key] = toDateOrNull(body[key]);
  return data;
}

async function update(req, res) {
  const existing = await prisma.announcement.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Announcement not found.' });
  const ann = shape('Announcement', await prisma.announcement.update({ where: { id: existing.id }, data: updateData(req.body) }));
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'announcements', recordId: ann._id, detail: `Updated announcement: ${ann.title}` });
  res.json({ announcement: ann });
}

async function remove(req, res) {
  const existing = await prisma.announcement.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Announcement not found.' });
  const ann = await prisma.announcement.delete({ where: { id: existing.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'announcements', recordId: ann.id, detail: `Deleted announcement: ${ann.title}` });
  res.json({ message: 'Announcement deleted.' });
}

module.exports = { list, create, update, remove };
