const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Employee = require('../models/Employee');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const WallPost = require('../models/WallPost');
const writeAudit = require('../utils/audit');

async function getProfile(req, res) {
  const [employees, events, notifications, wallPosts, activity] = await Promise.all([
    Employee.countDocuments({}),
    Event.countDocuments({}),
    Notification.countDocuments({}),
    WallPost.countDocuments({}),
    AuditLog.find({ actorRef: req.user._id }).sort({ createdAt: -1 }).limit(10),
  ]);
  res.json({
    user: req.user.toSafeJSON(),
    platformStats: { employees, events, notifications, wallPosts },
    activity,
  });
}

async function updateProfile(req, res) {
  const { name, email, phone, department, location, branch } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (email) updates.email = String(email).toLowerCase().trim();
  if (phone !== undefined) updates.phone = phone;
  if (department !== undefined) updates.department = department;
  if (location !== undefined) updates.location = location;
  if (branch !== undefined) updates.branch = branch;

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  await writeAudit({ ip: req.ip, user, action: 'UPDATE', entity: 'users', recordId: user._id, detail: 'Updated profile' });
  res.json({ user: user.toSafeJSON() });
}

module.exports = { getProfile, updateProfile };
