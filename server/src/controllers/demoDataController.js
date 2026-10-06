const { prisma } = require('../db');
const writeAudit = require('../utils/audit');

// Order matters for the FKs: dependents (attendance, leave, assets, rsvps,
// wall posts, notifications, ...) before the users/employees/events they
// reference. Every FK pointing at users/employees/events is ON DELETE CASCADE
// or SET NULL, so a demo user/employee/event also takes any non-demo child
// rows still attached to it with it (those are not included in `counts`).
const MODELS = {
  attendance: prisma.attendance,
  leaveRequests: prisma.leaveRequest,
  assets: prisma.asset,
  rsvps: prisma.rsvp,
  wallPosts: prisma.wallPost,
  notifications: prisma.notification,
  announcements: prisma.announcement,
  jobApplications: prisma.jobApplication,
  users: prisma.user,
  employees: prisma.employee,
  events: prisma.event,
};

// How many dummy/demo rows exist, so the UI only offers "Clear" when there is something to clear.
async function status(req, res) {
  const counts = {};
  let total = 0;
  for (const [key, delegate] of Object.entries(MODELS)) {
    counts[key] = await delegate.count({ where: { isDemo: true } });
    total += counts[key];
  }
  res.json({ total, counts });
}

// Superadmin-only: wipe every record flagged isDemo (seeded sample/demo data)
// across every table it can appear in, leaving real data untouched.
async function clearAll(req, res) {
  const counts = {};
  let total = 0;
  for (const [key, delegate] of Object.entries(MODELS)) {
    const result = await delegate.deleteMany({ where: { isDemo: true } });
    counts[key] = result.count;
    total += result.count;
  }

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'demo_data',
    recordId: '-',
    detail: `Cleared ${total} dummy/demo record(s) across ${Object.keys(MODELS).length} collections`,
  });

  res.json({ message: `Deleted ${total} dummy record(s) across all collections.`, total, counts });
}

module.exports = { status, clearAll };
