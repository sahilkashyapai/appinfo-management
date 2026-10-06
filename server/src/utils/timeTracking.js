const prisma = require('../db/prisma');
const { shape } = require('../db/shape');

const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Wall-clock cap from startedAt, regardless of pause state - a paused timer
// left open indefinitely would otherwise dodge the cap entirely.
// Takes and returns a shaped TimeLog (see db/shape.js: totalPausedMs is a Number).
async function autoStopIfExpired(timer) {
  if (!timer || timer.status === 'stopped') return timer;
  const now = new Date();
  if (now - new Date(timer.startedAt) < TEN_HOURS_MS) return timer;
  const totalPausedMs = Number(timer.totalPausedMs || 0) + (timer.status === 'paused' && timer.pausedAt ? now - new Date(timer.pausedAt) : 0);
  const updated = await prisma.timeLog.update({
    where: { id: String(timer._id ?? timer.id) },
    data: { status: 'stopped', stoppedAt: now, autoStopped: true, pausedAt: null, totalPausedMs: BigInt(totalPausedMs) },
  });
  return shape('TimeLog', updated);
}

module.exports = { startOfDay, autoStopIfExpired, TEN_HOURS_MS };
