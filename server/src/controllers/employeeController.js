const Employee = require('../models/Employee');
const Department = require('../models/Department');
const User = require('../models/User');
const Rsvp = require('../models/Rsvp');
const WallPost = require('../models/WallPost');
const Notification = require('../models/Notification');
const Attendance = require('../models/Attendance');
const Document = require('../models/Document');
const Asset = require('../models/Asset');
const writeAudit = require('../utils/audit');
const { EMP_ID_PREFIX, EMP_ID_REGEX, nextEmpId } = require('../utils/empId');
const { ADMIN_ROLES } = require('../utils/roles');
const { superadminEmployeeIds, excludeSuperadminEmployees } = require('../utils/hideSuperadmin');

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

  await excludeSuperadminEmployees(filter, req.user.role, '_id');

  const [items, total] = await Promise.all([
    // Real employees before demo/seed data, regardless of when each was created —
    // otherwise a freshly-seeded demo batch buries real employees on later pages.
    Employee.find(filter)
      .sort({ isDemo: 1, createdAt: -1 })
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
  const exclude = {};
  await excludeSuperadminEmployees(exclude, req.user.role, '_id');
  const [active, inactive, leave, total] = await Promise.all([
    Employee.countDocuments({ ...exclude, status: 'active' }),
    Employee.countDocuments({ ...exclude, status: 'inactive' }),
    Employee.countDocuments({ ...exclude, status: 'leave' }),
    Employee.countDocuments({ ...exclude }),
  ]);
  res.json({ active, inactive, leave, total });
}

async function getOne(req, res) {
  const emp = await Employee.findById(req.params.id).populate('managerRef', 'name').populate('userRef', 'email role avatarUrl');
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  if (req.user.role !== 'superadmin' && emp.userRef?.role === 'superadmin') {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  // Documents/assets are personal records — only visible to admin-panel roles
  // or the employee viewing their own record, never to a coworker browsing the directory.
  const canSeeDocsAssets = ADMIN_ROLES.includes(req.user.role) || (emp.userRef && String(emp.userRef._id) === String(req.user._id));

  const [wishesReceived, postsCount, eventsRsvpCount, documents, assets] = await Promise.all([
    Notification.countDocuments({ title: new RegExp(emp.name, 'i'), type: 'birthday' }),
    emp.userRef ? WallPost.countDocuments({ authorRef: emp.userRef }) : 0,
    Rsvp.countDocuments({ employeeRef: emp._id, status: 'yes' }),
    canSeeDocsAssets ? Document.find({ employeeRef: emp._id }).sort({ createdAt: -1 }) : [],
    canSeeDocsAssets ? Asset.find({ employeeRef: emp._id }).sort({ createdAt: -1 }) : [],
  ]);

  const years = yearsSince(emp.joined);
  const reachedMilestones = [1, 3, 5, 7, 10].filter((y) => years >= y);
  const milestones = reachedMilestones.length ? [reachedMilestones[reachedMilestones.length - 1]] : [];

  res.json({
    employee: shapeForViewer(emp, req.user.role),
    years,
    milestones,
    stats: { wishesReceived, postsCount, eventsRsvpCount },
    documents,
    assets,
  });
}

async function nextId(req, res) {
  res.json({ empId: await nextEmpId(Employee) });
}

async function orgChart(req, res) {
  const employees = await Employee.find({ status: 'active' })
    .select('name desig dept roleLabel avatarIndex managerRef userRef')
    .populate('userRef', 'avatarUrl role')
    .lean();

  const visible = req.user.role === 'superadmin' ? employees : employees.filter((e) => e.userRef?.role !== 'superadmin');

  const items = visible.map((e) => ({
    _id: e._id,
    name: e.name,
    desig: e.desig,
    dept: e.dept,
    roleLabel: e.roleLabel,
    avatarIndex: e.avatarIndex,
    avatarUrl: e.userRef?.avatarUrl || '',
    managerRef: e.managerRef ? String(e.managerRef) : null,
  }));
  res.json({ items });
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

  const normalizedEmail = String(email).toLowerCase().trim();
  const trimmedPhone = phone ? String(phone).trim() : '';

  const [dupeEmail, dupeEmpId, dupePhone] = await Promise.all([
    Employee.findOne({ email: normalizedEmail }),
    empId ? Employee.findOne({ empId }) : null,
    trimmedPhone ? Employee.findOne({ phone: trimmedPhone }) : null,
  ]);
  if (dupeEmail) return res.status(409).json({ message: `An employee with email ${normalizedEmail} already exists.` });
  if (dupeEmpId) return res.status(409).json({ message: `Employee ID ${empId} is already in use.` });
  if (dupePhone) return res.status(409).json({ message: `An employee with mobile number ${trimmedPhone} already exists.` });

  if (!empId) empId = await nextEmpId(Employee);

  const department = await Department.findOne({ name: new RegExp(`^${dept}$`, 'i') });
  if (!department) return res.status(400).json({ message: `Unknown department: ${dept}` });

  let emp;
  try {
    emp = await Employee.create({
      empId,
      name,
      dept: department.name,
      deptRef: department._id,
      desig,
      roleLabel: roleLabel || 'Engineer / Developer',
      joined: new Date(joined),
      dob: new Date(dob),
      email: normalizedEmail,
      phone: trimmedPhone,
      location,
      status: status || 'active',
      managerRef: managerRef || null,
      avatarIndex: Math.floor(Math.random() * 10),
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `That ${field} is already in use by another employee.` });
    }
    throw err;
  }

  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'employees', recordId: emp.empId, detail: `Created employee: ${emp.name}` });
  res.status(201).json({ employee: emp });
}

async function update(req, res) {
  const current = await Employee.findById(req.params.id, 'empId userRef').populate('userRef', 'role');
  if (!current) return res.status(404).json({ message: 'Employee not found.' });
  if (req.user.role !== 'superadmin' && current.userRef?.role === 'superadmin') {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const updates = { ...req.body };

  if (updates.empId !== undefined) {
    const empId = String(updates.empId).trim();

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

  if (updates.email !== undefined) {
    const normalizedEmail = String(updates.email).toLowerCase().trim();
    const dupe = await Employee.findOne({ email: normalizedEmail, _id: { $ne: req.params.id } });
    if (dupe) return res.status(409).json({ message: `Email ${normalizedEmail} is already in use by another employee.` });
    updates.email = normalizedEmail;
  }
  if (updates.phone !== undefined) {
    const trimmedPhone = String(updates.phone).trim();
    if (trimmedPhone) {
      const dupe = await Employee.findOne({ phone: trimmedPhone, _id: { $ne: req.params.id } });
      if (dupe) return res.status(409).json({ message: `Mobile number ${trimmedPhone} is already in use by another employee.` });
    }
    updates.phone = trimmedPhone;
  }

  if (updates.managerRef !== undefined && updates.managerRef) {
    if (String(updates.managerRef) === String(req.params.id)) {
      return res.status(400).json({ message: 'An employee cannot be their own manager.' });
    }
    // Walk up the proposed new manager's chain — if it leads back to this employee, it's a cycle.
    let cursor = await Employee.findById(updates.managerRef, 'managerRef');
    const seen = new Set();
    while (cursor) {
      if (String(cursor._id) === String(req.params.id)) {
        return res.status(400).json({ message: 'That would create a circular reporting line.' });
      }
      if (seen.has(String(cursor._id))) break; // guard against any pre-existing bad data
      seen.add(String(cursor._id));
      cursor = cursor.managerRef ? await Employee.findById(cursor.managerRef, 'managerRef') : null;
    }
  }

  let emp;
  try {
    emp = await Employee.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ message: `That ${field} is already in use by another employee.` });
    }
    throw err;
  }
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

  const target = await Employee.findById(req.params.id).populate('userRef', 'role');
  if (!target) return res.status(404).json({ message: 'Employee not found.' });
  if (req.user.role !== 'superadmin' && target.userRef?.role === 'superadmin') {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  target.status = status;
  await target.save();
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'employees', recordId: target.empId, detail: `Set status of ${target.name} to ${status}` });
  res.json({ employee: target });
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

module.exports = { list, summary, getOne, create, update, setStatus, remove, yearsSince, nextId, orgChart };
