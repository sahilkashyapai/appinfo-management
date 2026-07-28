const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Employee = require('../models/Employee');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const WallPost = require('../models/WallPost');
const writeAudit = require('../utils/audit');
const { BRANCH_LOCATIONS } = require('../utils/offices');
const { BRANCH_EDITOR_ROLES } = require('../utils/roles');

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
  const { name, email, phone, department, location, branch, avatarUrl } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (email) updates.email = String(email).toLowerCase().trim();
  if (phone !== undefined) updates.phone = phone;
  if (department !== undefined) updates.department = department;
  if (location !== undefined) updates.location = location;
  // Branch determines office scoping downstream (see managedBranch/managedLocation
  // in adminController), so only a superadmin or proadmin may change their own
  // branch — anyone else's request to change it is silently ignored rather than accepted.
  if (branch !== undefined && BRANCH_EDITOR_ROLES.includes(req.user.role)) {
    if (branch && !BRANCH_LOCATIONS[branch]) {
      return res.status(400).json({ message: `Unknown branch: ${branch}` });
    }
    updates.branch = branch;
    if (branch) updates.location = BRANCH_LOCATIONS[branch];
  }
  if (avatarUrl !== undefined) {
    if (avatarUrl && !avatarUrl.startsWith('data:image/')) return res.status(400).json({ message: 'Invalid image data.' });
    updates.avatarUrl = avatarUrl;
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });

  // Keep the linked Employee directory record in sync so admins see the same
  // name/email/phone/location the user just set on their own profile.
  if (user.employeeRef) {
    const empUpdates = {};
    if (updates.name !== undefined) empUpdates.name = updates.name;
    if (updates.email !== undefined) empUpdates.email = updates.email;
    if (updates.phone !== undefined) empUpdates.phone = updates.phone;
    if (updates.location !== undefined) empUpdates.location = updates.location;
    if (Object.keys(empUpdates).length) {
      try {
        await Employee.findByIdAndUpdate(user.employeeRef, empUpdates, { runValidators: true });
      } catch (err) {
        console.error('[profile] could not sync Employee record:', err.message);
      }
    }
  }

  await writeAudit({ ip: req.ip, user, action: 'UPDATE', entity: 'users', recordId: user._id, detail: 'Updated profile' });
  res.json({ user: user.toSafeJSON() });
}

module.exports = { getProfile, updateProfile };
