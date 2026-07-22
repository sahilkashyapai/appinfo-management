const TimeLog = require('../models/TimeLog');
const getSettings = require('../utils/getSettings');
const writeAudit = require('../utils/audit');
const { startOfDay, autoStopIfExpired } = require('../utils/timeTracking');

async function findToday(userRef) {
  const timer = await TimeLog.findOne({ userRef, date: startOfDay() });
  return autoStopIfExpired(timer);
}

async function myToday(req, res) {
  const settings = await getSettings();
  const timer = await findToday(req.user._id);
  res.json({ enabled: settings.timeTracking.enabled, timer });
}

async function start(req, res) {
  const settings = await getSettings();
  if (!settings.timeTracking.enabled) {
    return res.status(403).json({ message: 'Time tracking is currently disabled by your administrator.' });
  }
  const date = startOfDay();
  const existing = await TimeLog.findOne({ userRef: req.user._id, date });
  if (existing) return res.status(409).json({ message: 'You already started your timer today.' });

  const timer = await TimeLog.create({ userRef: req.user._id, date, startedAt: new Date(), ip: req.ip });
  res.json({ timer });
}

async function pause(req, res) {
  const timer = await findToday(req.user._id);
  if (!timer) return res.status(404).json({ message: 'No timer started today.' });
  if (timer.status !== 'running') return res.status(400).json({ message: 'Timer is not running.' });

  timer.status = 'paused';
  timer.pausedAt = new Date();
  await timer.save();
  res.json({ timer });
}

async function resume(req, res) {
  const timer = await findToday(req.user._id);
  if (!timer) return res.status(404).json({ message: 'No timer started today.' });
  if (timer.status !== 'paused') return res.status(400).json({ message: 'Timer is not paused.' });

  timer.totalPausedMs += new Date() - timer.pausedAt;
  timer.pausedAt = null;
  timer.status = 'running';
  await timer.save();
  res.json({ timer });
}

async function stop(req, res) {
  const timer = await findToday(req.user._id);
  if (!timer) return res.status(404).json({ message: 'No timer started today.' });
  if (timer.status === 'stopped') return res.status(400).json({ message: 'Timer is already stopped.' });

  if (timer.status === 'paused') {
    timer.totalPausedMs += new Date() - timer.pausedAt;
    timer.pausedAt = null;
  }
  timer.status = 'stopped';
  timer.stoppedAt = new Date();
  await timer.save();
  res.json({ timer });
}

async function today(req, res) {
  const items = await TimeLog.find({ date: startOfDay() })
    .populate('userRef', 'name email department avatarIndex avatarUrl')
    .sort({ startedAt: -1 });
  res.json({ items });
}

function buildFilter(query) {
  const { user, from, to } = query;
  const filter = {};
  if (user) filter.userRef = user;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(new Date(from));
    if (to) filter.date.$lte = startOfDay(new Date(to));
  }
  return filter;
}

async function list(req, res) {
  const filter = buildFilter(req.query);
  const { page = 1, limit = 25 } = req.query;
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    TimeLog.find(filter)
      .populate('userRef', 'name email department avatarIndex avatarUrl')
      .sort({ date: -1 })
      .skip((pg - 1) * lim)
      .limit(lim),
    TimeLog.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function clear(req, res) {
  const { from, to } = req.body;
  if (!from && !to) return res.status(400).json({ message: 'Provide a from and/or to date.' });

  const filter = { date: {} };
  if (from) filter.date.$gte = startOfDay(new Date(from));
  if (to) filter.date.$lte = startOfDay(new Date(to));

  const result = await TimeLog.deleteMany(filter);
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'time_logs',
    recordId: '—',
    detail: `Cleared ${result.deletedCount} time-tracking record(s)${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}`,
  });
  res.json({ deletedCount: result.deletedCount });
}

async function clearAll(req, res) {
  const result = await TimeLog.deleteMany({});
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'time_logs',
    recordId: '—',
    detail: `Cleared all ${result.deletedCount} time-tracking record(s)`,
  });
  res.json({ deletedCount: result.deletedCount });
}

module.exports = { myToday, start, pause, resume, stop, today, list, clear, clearAll };
