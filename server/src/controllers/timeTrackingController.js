const { prisma, shape, shapeMany, sel, andWhere } = require('../db');
const getSettings = require('../utils/getSettings');
const writeAudit = require('../utils/audit');
const { startOfDay, autoStopIfExpired } = require('../utils/timeTracking');
const { excludeSuperadminUsers } = require('../utils/hideSuperadmin');
const { scopedUserIds } = require('../utils/officeScope');
const { SUPER_TIER_ROLES } = require('../utils/roles');

const USER_SELECT = sel('User', 'name email department avatarIndex avatarUrl');

// Returns today's shaped timer for this user (one per user per day), or null.
async function findToday(userId) {
  const row = await prisma.timeLog.findUnique({ where: { userId_date: { userId: String(userId), date: startOfDay() } } });
  return autoStopIfExpired(row ? shape('TimeLog', row) : null);
}

async function saveTimer(timer, data) {
  const row = await prisma.timeLog.update({ where: { id: timer.id }, data });
  return shape('TimeLog', row);
}

async function myToday(req, res) {
  const settings = await getSettings();
  const timer = await findToday(req.user._id);
  res.json({ enabled: settings.timeTracking.enabled, timer });
}

async function start(req, res) {
  if (SUPER_TIER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Time tracking is not applicable for superadmin/proadmin accounts.' });
  }
  const settings = await getSettings();
  if (!settings.timeTracking.enabled) {
    return res.status(403).json({ message: 'Time tracking is currently disabled by your administrator.' });
  }
  const date = startOfDay();
  const userId = String(req.user._id);
  const existing = await prisma.timeLog.findUnique({ where: { userId_date: { userId, date } }, select: { id: true } });
  if (existing) return res.status(409).json({ message: 'You already started your timer today.' });

  try {
    const row = await prisma.timeLog.create({ data: { userId, date, startedAt: new Date(), ip: req.ip || '' } });
    res.json({ timer: shape('TimeLog', row) });
  } catch (err) {
    // A concurrent start for the same day hit the (userId, date) unique key.
    if (err.code === 'P2002') return res.status(409).json({ message: 'You already started your timer today.' });
    throw err;
  }
}

async function pause(req, res) {
  const timer = await findToday(req.user._id);
  if (!timer) return res.status(404).json({ message: 'No timer started today.' });
  if (timer.status !== 'running') return res.status(400).json({ message: 'Timer is not running.' });

  res.json({ timer: await saveTimer(timer, { status: 'paused', pausedAt: new Date() }) });
}

async function resume(req, res) {
  const timer = await findToday(req.user._id);
  if (!timer) return res.status(404).json({ message: 'No timer started today.' });
  if (timer.status !== 'paused') return res.status(400).json({ message: 'Timer is not paused.' });

  const totalPausedMs = Number(timer.totalPausedMs || 0) + (new Date() - new Date(timer.pausedAt));
  res.json({ timer: await saveTimer(timer, { totalPausedMs: BigInt(totalPausedMs), pausedAt: null, status: 'running' }) });
}

async function stop(req, res) {
  const timer = await findToday(req.user._id);
  if (!timer) return res.status(404).json({ message: 'No timer started today.' });
  if (timer.status === 'stopped') return res.status(400).json({ message: 'Timer is already stopped.' });

  const data = { status: 'stopped', stoppedAt: new Date() };
  if (timer.status === 'paused') {
    data.totalPausedMs = BigInt(Number(timer.totalPausedMs || 0) + (new Date() - new Date(timer.pausedAt)));
    data.pausedAt = null;
  }
  res.json({ timer: await saveTimer(timer, data) });
}

async function today(req, res) {
  const where = { date: startOfDay() };
  await excludeSuperadminUsers(where, req.user.role, 'userId');
  const scopedIds = await scopedUserIds(req.user);
  if (scopedIds) andWhere(where, { userId: { in: scopedIds } });
  const items = await prisma.timeLog.findMany({
    where,
    include: { userRef: { select: USER_SELECT } },
    orderBy: { startedAt: 'desc' },
  });
  res.json({ items: shapeMany('TimeLog', items) });
}

function buildFilter(query) {
  const { user, from, to } = query;
  const where = {};
  if (user) where.userId = String(user);
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = startOfDay(new Date(from));
    if (to) where.date.lte = startOfDay(new Date(to));
  }
  return where;
}

async function list(req, res) {
  const where = buildFilter(req.query);
  await excludeSuperadminUsers(where, req.user.role, 'userId');
  // ANDed with any `user` filter: a user outside the viewer's office yields nothing.
  const scopedIds = await scopedUserIds(req.user);
  if (scopedIds) andWhere(where, { userId: { in: scopedIds } });
  const { page = 1, limit = 25 } = req.query;
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    prisma.timeLog.findMany({
      where,
      include: { userRef: { select: USER_SELECT } },
      orderBy: { date: 'desc' },
      skip: (pg - 1) * lim,
      take: lim,
    }),
    prisma.timeLog.count({ where }),
  ]);
  res.json({ items: shapeMany('TimeLog', items), total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function clear(req, res) {
  const { from, to } = req.body;
  if (!from && !to) return res.status(400).json({ message: 'Provide a from and/or to date.' });

  const where = { date: {} };
  if (from) where.date.gte = startOfDay(new Date(from));
  if (to) where.date.lte = startOfDay(new Date(to));

  const result = await prisma.timeLog.deleteMany({ where });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'time_logs',
    recordId: '—',
    detail: `Cleared ${result.count} time-tracking record(s)${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}`,
  });
  res.json({ deletedCount: result.count });
}

async function clearAll(req, res) {
  const result = await prisma.timeLog.deleteMany({});
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'time_logs',
    recordId: '—',
    detail: `Cleared all ${result.count} time-tracking record(s)`,
  });
  res.json({ deletedCount: result.count });
}

module.exports = { myToday, start, pause, resume, stop, today, list, clear, clearAll };
