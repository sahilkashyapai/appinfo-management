const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Wall-clock cap from startedAt, regardless of pause state — a paused timer
// left open indefinitely would otherwise dodge the cap entirely.
async function autoStopIfExpired(timer) {
  if (!timer || timer.status === 'stopped') return timer;
  const now = new Date();
  if (now - timer.startedAt >= TEN_HOURS_MS) {
    if (timer.status === 'paused') {
      timer.totalPausedMs += now - timer.pausedAt;
      timer.pausedAt = null;
    }
    timer.status = 'stopped';
    timer.stoppedAt = now;
    timer.autoStopped = true;
    await timer.save();
  }
  return timer;
}

module.exports = { startOfDay, autoStopIfExpired, TEN_HOURS_MS };
