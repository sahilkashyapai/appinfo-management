const Employee = require('../models/Employee');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Asset = require('../models/Asset');
const Event = require('../models/Event');
const Rsvp = require('../models/Rsvp');
const WallPost = require('../models/WallPost');
const Notification = require('../models/Notification');
const Announcement = require('../models/Announcement');
const JobApplication = require('../models/JobApplication');
const writeAudit = require('../utils/audit');

// Order matters: dependents (attendance, leave, assets, rsvps, linked users)
// before the employees they reference, though deleteMany doesn't cascade —
// this is just for a tidy audit/log read, not a functional requirement.
const MODELS = {
  attendance: Attendance,
  leaveRequests: LeaveRequest,
  assets: Asset,
  rsvps: Rsvp,
  wallPosts: WallPost,
  notifications: Notification,
  announcements: Announcement,
  jobApplications: JobApplication,
  users: User,
  employees: Employee,
  events: Event,
};

// Superadmin-only: wipe every record flagged isDemo (seeded sample/demo data)
// across every collection it can appear in, leaving real data untouched.
async function clearAll(req, res) {
  const counts = {};
  let total = 0;
  for (const [key, Model] of Object.entries(MODELS)) {
    const result = await Model.deleteMany({ isDemo: true });
    counts[key] = result.deletedCount;
    total += result.deletedCount;
  }

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'demo_data',
    recordId: '—',
    detail: `Cleared ${total} dummy/demo record(s) across ${Object.keys(MODELS).length} collections`,
  });

  res.json({ message: `Deleted ${total} dummy record(s) across all collections.`, total, counts });
}

module.exports = { clearAll };
