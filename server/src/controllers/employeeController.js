const Employee = require('../models/Employee');
const Department = require('../models/Department');
const User = require('../models/User');
const Rsvp = require('../models/Rsvp');
const WallPost = require('../models/WallPost');
const Notification = require('../models/Notification');
const Attendance = require('../models/Attendance');
const writeAudit = require('../utils/audit');
const { EMP_ID_PREFIX, EMP_ID_REGEX, nextEmpId } = require('../utils/empId');
const { ADMIN_ROLES } = require('../utils/roles');

// Mobile numbers are only shown to admin-panel roles — everyone else gets the
// directory view (name/email/role/photo/designation/dates) with phone stripped.
function shapeForViewer(emp, viewerRole) {
  const obj = emp.toObject();
  if (!ADMIN_ROLES.includes(viewerRole)) delete obj.phone;
  return obj;
}

function yearsSince(date) {
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const anniversaryPassed = now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate());
  if (!anniversaryPassed) years -= 1;
  return Math.max(years, 0);
}

async function list(req, res) {
  const { dept, status, location, q, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (dept && dept !== 'all') filter.dept = new RegExp(`^${dept}$`, 'i');
  if (status && status !== 'all') filter.status = status;
  if (location && location !== 'all') filter.location = new RegExp(`^${location}$`, 'i');
  if (q) {
    const re = new RegExp(q, 'i');
    filter.$or = [{ name: re }, { email: re }, { dept: re }, { desig: re }];
  }

  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate('managerRef', 'name')
      .populate('userRef', 'role avatarUrl'),
    Employee.countDocuments(filter),
  ]);

  res.json({
    items: items.map((e) => shapeForViewer(e, req.user.role)),
    total,
    page: pg,
    limit: lim,
    pages: Math.ceil(total / lim) || 1,
  });
}

async function summary(req, res) {
  const [active, inactive, leave, total] = await Promise.all([
    Employee.countDocuments({ status: 'active' }),
    Employee.countDocuments({ status: 'inactive' }),
    Employee.countDocuments({ status: 'leave' }),
    Employee.countDocuments({}),
  ]);
  res.json({ active, inactive, leave, total });
}

async function getOne(req, res) {
  const emp = await Employee.findById(req.params.id).populate('managerRef', 'name').populate('userRef', 'email role avatarUrl');
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  const [wishesReceived, postsCount, eventsRsvpCount] = await Promise.all([
    Notification.countDocuments({ title: new RegExp(emp.name, 'i'), type: 'birthday' }),
    emp.userRef ? WallPost.countDocuments({ authorRef: emp.userRef }) : 0,
    Rsvp.countDocuments({ employeeRef: emp._id, status: 'yes' }),
  ]);

  const years = yearsSince(emp.joined);
  const milestones = [1, 3, 5, 7, 10].filter((y) => years >= y);

  res.json({ employee: shapeForViewer(emp, req.user.role), years, milestones, stats: { wishesReceived, postsCount, eventsRsvpCount } });
}

async function nextId(req, res) {
  res.json({ empId: await nextEmpId(Employee) });
}

async function create(req, res) {
  const { name, dept, desig, roleLabel, joined, dob, email, phone, location, status, managerRef } = req.body;
  let { empId } = req.body;
  if (!name || !dept || !desig || !joined || !dob || !email) {
    return res.status(400).json({ message: 'name, dept, desig, joined, dob and email are required.' });
  }
  if (empId && !EMP_ID_REGEX.test(empId)) {
    return res.status(400).json({ message: `Employee ID must look like ${EMP_ID_PREFIX}000071.` });
  }
  if (!empId) empId = await nextEmpId(Employee);

  const department = await Department.findOne({ name: new RegExp(`^${dept}$`, 'i') });
  if (!department) return res.status(400).json({ message: `Unknown department: ${dept}` });

  const emp = await Employee.create({
    empId,
    name,
    dept: department.name,
    deptRef: department._id,
    desig,
    roleLabel: roleLabel || 'Employee',
    joined: new Date(joined),
    dob: new Date(dob),
    email,
    phone,
    location,
    status: status || 'active',
    managerRef: managerRef || null,
    avatarIndex: Math.floor(Math.random() * 10),
  });

  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'employees', recordId: emp.empId, detail: `Created employee: ${emp.name}` });
  res.status(201).json({ employee: emp });
}

async function update(req, res) {
  const updates = { ...req.body };

  if (updates.empId !== undefined) {
    const empId = String(updates.empId).trim();
    const current = await Employee.findById(req.params.id, 'empId');
    if (!current) return res.status(404).json({ message: 'Employee not found.' });

    if (empId === current.empId) {
      delete updates.empId; // unchanged — don't force format validation on unrelated edits
    } else if (req.user.role !== 'superadmin') {
      delete updates.empId; // only a super admin may change an existing employee id
    } else {
      if (!EMP_ID_REGEX.test(empId)) {
        return res.status(400).json({ message: `Employee ID must look like ${EMP_ID_PREFIX}000071.` });
      }
      const dupe = await Employee.findOne({ empId, _id: { $ne: req.params.id } });
      if (dupe) return res.status(409).json({ message: `Employee ID ${empId} is already in use.` });
      updates.empId = empId;
    }
  }

  if (updates.dept) {
    const department = await Department.findOne({ name: new RegExp(`^${updates.dept}$`, 'i') });
    if (!department) return res.status(400).json({ message: `Unknown department: ${updates.dept}` });
    updates.dept = department.name;
    updates.deptRef = department._id;
  }
  if (updates.joined) updates.joined = new Date(updates.joined);
  if (updates.dob) updates.dob = new Date(updates.dob);

  const emp = await Employee.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  // Keep the linked User login in sync so the employee's own Profile page
  // matches what an admin just set here.
  if (emp.userRef) {
    const userUpdates = {};
    if (updates.name !== undefined) userUpdates.name = updates.name;
    if (updates.email !== undefined) userUpdates.email = updates.email;
    if (updates.phone !== undefined) userUpdates.phone = updates.phone;
    if (updates.location !== undefined) userUpdates.location = updates.location;
    if (Object.keys(userUpdates).length) {
      try {
        await User.findByIdAndUpdate(emp.userRef, userUpdates, { runValidators: true });
      } catch (err) {
        console.error('[employees] could not sync User account:', err.message);
      }
    }
  }

  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'employees', recordId: emp.empId, detail: `Updated employee: ${emp.name}` });
  res.json({ employee: emp });
}

async function setStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'inactive', 'leave'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });
  const emp = await Employee.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'employees', recordId: emp.empId, detail: `Set status of ${emp.name} to ${status}` });
  res.json({ employee: emp });
}

async function remove(req, res) {
  const emp = await Employee.findByIdAndDelete(req.params.id);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  await Attendance.deleteMany({ employeeRef: emp._id });
  if (emp.userRef) await User.findByIdAndDelete(emp.userRef);

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'employees',
    recordId: emp.empId,
    detail: `Permanently deleted employee: ${emp.name}${emp.userRef ? ' (and their login account)' : ''}`,
  });
  res.json({ message: 'Employee permanently deleted.' });
}

module.exports = { list, summary, getOne, create, update, setStatus, remove, yearsSince, nextId };
