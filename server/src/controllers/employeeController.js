const { prisma, shape, shapeMany, sel, likeSafe } = require('../db');
const writeAudit = require('../utils/audit');
const { EMP_ID_PREFIX, EMP_ID_DIGITS, EMP_ID_REGEX, nextEmpId } = require('../utils/empId');
const { ADMIN_ROLES, LOGIN_ACCESS_ROLES } = require('../utils/roles');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');
const { resolveScopeLocation, isOutsideScope, scopeEmployeeLocationFilter } = require('../utils/officeScope');
const { ROLE_LABEL_ORDER } = require('../utils/roleLabels');

// Mobile numbers are only shown to admin-panel roles — everyone else gets the
// directory view (name/email/role/photo/designation/dates) with phone stripped.
function shapeForViewer(emp, viewerRole) {
  const obj = { ...emp };
  if (!ADMIN_ROLES.includes(viewerRole)) delete obj.phone;
  // Login access (the linked account's role) is only meaningful to admin-tier
  // viewers — plain employees browsing the directory shouldn't see who has
  // admin/superadmin login access.
  if (!LOGIN_ACCESS_ROLES.includes(viewerRole) && obj.userRef && typeof obj.userRef === 'object') {
    obj.userRef = { ...obj.userRef };
    delete obj.userRef.role;
  }
  return obj;
}

function yearsSince(date) {
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const anniversaryPassed = now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate());
  if (!anniversaryPassed) years -= 1;
  return Math.max(years, 0);
}

// Seniority rank for a roleLabel. Legacy records with a roleLabel outside the
// current list (e.g. old free-text titles from before the dropdown existed)
// fall back to "least senior" instead of floating to the very top.
function roleRank(roleLabel) {
  const idx = ROLE_LABEL_ORDER.indexOf(roleLabel);
  return idx === -1 ? ROLE_LABEL_ORDER.length : idx;
}

// Binary string order, the same as Mongo's default $sort on a string field.
function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Prisma unique-violation target -> the field name the old Mongo keyPattern gave
// (MySQL reports the index name, e.g. "employees_email_key").
function duplicateField(err) {
  const target = err.meta?.target;
  if (Array.isArray(target)) return target[0] || 'field';
  return String(target || 'field').replace(/^employees_/, '').replace(/_key$/, '');
}

function roleLabelError(roleLabel) {
  return `\`${roleLabel}\` is not a valid enum value for path \`roleLabel\`.`;
}

async function list(req, res) {
  const { dept, status, location, q, page = 1, limit = 10 } = req.query;
  const where = {};
  if (dept && dept !== 'all') where.dept = { equals: String(dept) };
  if (status && status !== 'all') where.status = status;
  if (location && location !== 'all') where.location = { equals: String(location) };
  if (q) {
    const contains = likeSafe(q);
    where.OR = [{ name: { contains } }, { email: { contains } }, { dept: { contains } }, { desig: { contains } }];
  }

  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  await excludeSuperadminEmployees(where);
  await scopeEmployeeLocationFilter(where, req.user);

  // Sorted by seniority (roleLabel, most senior first) rather than creation
  // order. The rank is an arbitrary list order, so it's computed here over the
  // matching rows' sort keys, then only the requested page is loaded in full.
  // Real employees still rank ahead of demo/seed data at the same seniority,
  // otherwise a freshly-seeded demo batch buries real employees at that level
  // on later pages.
  const keys = await prisma.employee.findMany({ where, select: { id: true, roleLabel: true, isDemo: true, name: true } });
  keys.sort((a, b) => roleRank(a.roleLabel) - roleRank(b.roleLabel) || Number(a.isDemo) - Number(b.isDemo) || cmp(a.name, b.name) || cmp(a.id, b.id));
  const total = keys.length;
  const pageIds = keys.slice((pg - 1) * lim, pg * lim).map((k) => k.id);

  const rows = pageIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: pageIds } },
        include: {
          managerRef: { select: sel('Employee', 'name') },
          userRef: { select: sel('User', 'role avatarUrl') },
        },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, shape('Employee', r)]));
  const items = pageIds.map((id) => byId.get(id)).filter(Boolean);

  // Some logins (e.g. admins created before linking existed) point at their
  // employee via User.employeeId or share its email, but the Employee's own
  // userId was never set — match those up so Login Access shows the real role.
  const unlinked = items.filter((e) => !e.userRef);
  if (unlinked.length) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { employeeId: { in: unlinked.map((e) => e.id) } },
          { email: { in: unlinked.map((e) => String(e.email || '').toLowerCase()) } },
        ],
      },
      select: sel('User', 'role avatarUrl email employeeRef'),
    });
    for (const e of unlinked) {
      const match = users.find((u) => String(u.employeeId) === String(e.id))
        || users.find((u) => String(u.email).toLowerCase() === String(e.email || '').toLowerCase());
      if (match) e.userRef = shape('User', { id: match.id, role: match.role, avatarUrl: match.avatarUrl });
    }
  }

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
  await excludeSuperadminEmployees(exclude);
  await scopeEmployeeLocationFilter(exclude, req.user);
  const [active, inactive, leave, total] = await Promise.all([
    prisma.employee.count({ where: { ...exclude, status: 'active' } }),
    prisma.employee.count({ where: { ...exclude, status: 'inactive' } }),
    prisma.employee.count({ where: { ...exclude, status: 'leave' } }),
    prisma.employee.count({ where: { ...exclude } }),
  ]);
  res.json({ active, inactive, leave, total });
}

async function getOne(req, res) {
  const row = await prisma.employee.findUnique({
    where: { id: String(req.params.id) },
    include: {
      managerRef: { select: sel('Employee', 'name') },
      userRef: { select: sel('User', 'email role avatarUrl') },
    },
  });
  if (!row) return res.status(404).json({ message: 'Employee not found.' });
  const emp = shape('Employee', row);

  if (await isOutsideScope(req.user, emp.location)) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  // Documents/assets are personal records — only visible to admin-panel roles
  // or the employee viewing their own record, never to a coworker browsing the directory.
  const canSeeDocsAssets = ADMIN_ROLES.includes(req.user.role) || (emp.userRef && String(emp.userRef._id) === String(req.user._id));

  const [wishesReceived, postsCount, eventsRsvpCount, documents, assets] = await Promise.all([
    prisma.notification.count({ where: { title: { contains: likeSafe(emp.name) }, type: 'birthday' } }),
    row.userId ? prisma.wallPost.count({ where: { authorId: row.userId } }) : 0,
    prisma.rsvp.count({ where: { employeeId: row.id, status: 'yes' } }),
    canSeeDocsAssets ? prisma.document.findMany({ where: { employeeId: row.id }, orderBy: { createdAt: 'desc' } }) : [],
    canSeeDocsAssets ? prisma.asset.findMany({ where: { employeeId: row.id }, orderBy: { createdAt: 'desc' } }) : [],
  ]);

  const years = yearsSince(emp.joined);
  const reachedMilestones = [1, 3, 5, 7, 10].filter((y) => years >= y);
  const milestones = reachedMilestones.length ? [reachedMilestones[reachedMilestones.length - 1]] : [];

  res.json({
    employee: shapeForViewer(emp, req.user.role),
    years,
    milestones,
    stats: { wishesReceived, postsCount, eventsRsvpCount },
    documents: shapeMany('Document', documents),
    assets: shapeMany('Asset', assets),
  });
}

async function nextId(req, res) {
  res.json({ empId: await nextEmpId() });
}

async function orgChart(req, res) {
  const where = { status: 'active' };
  await scopeEmployeeLocationFilter(where, req.user);
  const employees = await prisma.employee.findMany({
    where,
    select: {
      ...sel('Employee', 'name desig dept roleLabel avatarIndex managerRef location'),
      userRef: { select: sel('User', 'avatarUrl role') },
    },
  });

  const items = employees.map((e) => ({
    _id: e.id,
    name: e.name,
    desig: e.desig,
    dept: e.dept,
    roleLabel: e.roleLabel,
    avatarIndex: e.avatarIndex,
    avatarUrl: e.userRef?.avatarUrl || '',
    managerRef: e.managerId ? String(e.managerId) : null,
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
  // roleLabel was a Mongoose enum; MySQL stores it as a plain string, so validate here.
  if (roleLabel && !ROLE_LABEL_ORDER.includes(roleLabel)) {
    return res.status(400).json({ message: `Employee validation failed: roleLabel: ${roleLabelError(roleLabel)}` });
  }
  // A superadmin scoped to one office can only ever create employees there —
  // silently pin the location rather than trusting whatever the client sent.
  const scopeLoc = await resolveScopeLocation(req.user);
  const effectiveLocation = scopeLoc || location;

  const normalizedEmail = String(email).toLowerCase().trim();
  const trimmedPhone = phone ? String(phone).trim() : '';

  const [dupeEmail, dupeEmpId, dupePhone] = await Promise.all([
    prisma.employee.findUnique({ where: { email: normalizedEmail }, select: { id: true } }),
    empId ? prisma.employee.findUnique({ where: { empId: String(empId) }, select: { id: true } }) : null,
    trimmedPhone ? prisma.employee.findFirst({ where: { phone: trimmedPhone }, select: { id: true } }) : null,
  ]);
  if (dupeEmail) return res.status(409).json({ message: `An employee with email ${normalizedEmail} already exists.` });
  if (dupeEmpId) return res.status(409).json({ message: `Employee ID ${empId} is already in use.` });
  if (dupePhone) return res.status(409).json({ message: `An employee with mobile number ${trimmedPhone} already exists.` });

  if (!empId) empId = await nextEmpId();

  const department = await prisma.department.findFirst({ where: { name: { equals: String(dept) } } });
  if (!department) return res.status(400).json({ message: `Unknown department: ${dept}` });

  let emp;
  try {
    emp = await prisma.employee.create({
      data: {
        empId: String(empId),
        name: String(name).trim(),
        dept: department.name,
        deptId: department.id,
        desig: String(desig).trim(),
        roleLabel: roleLabel || 'Engineer / Developer',
        joined: new Date(joined),
        dob: new Date(dob),
        email: normalizedEmail,
        phone: trimmedPhone,
        location: effectiveLocation ? String(effectiveLocation) : '',
        status: status || 'active',
        managerId: managerRef ? String(managerRef) : null,
        avatarIndex: Math.floor(Math.random() * 10),
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: `That ${duplicateField(err)} is already in use by another employee.` });
    }
    throw err;
  }

  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'employees', recordId: emp.empId, detail: `Created employee: ${emp.name}` });
  res.status(201).json({ employee: shape('Employee', emp) });
}

// Fields an update may set from the request body (old ref names included).
// Anything else in the body is ignored, as Mongoose's strict mode did.
const UPDATABLE = ['empId', 'name', 'dept', 'desig', 'roleLabel', 'joined', 'dob', 'email', 'phone', 'location', 'status', 'managerRef', 'userRef', 'avatarIndex', 'isDemo'];
// Required fields — Mongoose's runValidators rejected blanking these on update.
const REQUIRED_ON_UPDATE = ['empId', 'name', 'dept', 'desig', 'joined', 'dob', 'email'];

async function update(req, res) {
  const current = await prisma.employee.findUnique({ where: { id: String(req.params.id) }, select: { id: true, empId: true, location: true } });
  if (!current) return res.status(404).json({ message: 'Employee not found.' });
  if (await isOutsideScope(req.user, current.location)) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const updates = {};
  for (const key of UPDATABLE) if (req.body[key] !== undefined) updates[key] = req.body[key];

  for (const key of REQUIRED_ON_UPDATE) {
    if (updates[key] !== undefined && (updates[key] === null || String(updates[key]).trim() === '')) {
      return res.status(400).json({ message: `Validation failed: ${key}: Path \`${key}\` is required.` });
    }
  }
  if (updates.roleLabel !== undefined && !ROLE_LABEL_ORDER.includes(updates.roleLabel)) {
    return res.status(400).json({ message: `Validation failed: roleLabel: ${roleLabelError(updates.roleLabel)}` });
  }

  // A scoped superadmin can't move an employee to another office — pin it.
  const scopeLocForUpdate = await resolveScopeLocation(req.user);
  if (scopeLocForUpdate && updates.location !== undefined) {
    updates.location = scopeLocForUpdate;
  }

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
      const dupe = await prisma.employee.findFirst({ where: { empId, id: { not: current.id } }, select: { id: true } });
      if (dupe) return res.status(409).json({ message: `Employee ID ${empId} is already in use.` });
      updates.empId = empId;
    }
  }

  const data = {};
  if (updates.empId !== undefined) data.empId = updates.empId;
  if (updates.name !== undefined) data.name = String(updates.name).trim();
  if (updates.desig !== undefined) data.desig = String(updates.desig).trim();
  if (updates.roleLabel !== undefined) data.roleLabel = updates.roleLabel;
  if (updates.location !== undefined) data.location = updates.location == null ? '' : String(updates.location);
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.avatarIndex !== undefined) data.avatarIndex = Number(updates.avatarIndex);
  if (updates.isDemo !== undefined) data.isDemo = !!updates.isDemo;
  if (updates.userRef !== undefined) data.userId = updates.userRef ? String(updates.userRef) : null;
  if (updates.managerRef !== undefined) data.managerId = updates.managerRef ? String(updates.managerRef) : null;

  if (updates.dept) {
    const department = await prisma.department.findFirst({ where: { name: { equals: String(updates.dept) } } });
    if (!department) return res.status(400).json({ message: `Unknown department: ${updates.dept}` });
    data.dept = department.name;
    data.deptId = department.id;
  }
  if (updates.joined) data.joined = new Date(updates.joined);
  if (updates.dob) data.dob = new Date(updates.dob);

  if (updates.email !== undefined) {
    const normalizedEmail = String(updates.email).toLowerCase().trim();
    const dupe = await prisma.employee.findFirst({ where: { email: normalizedEmail, id: { not: current.id } }, select: { id: true } });
    if (dupe) return res.status(409).json({ message: `Email ${normalizedEmail} is already in use by another employee.` });
    data.email = normalizedEmail;
  }
  if (updates.phone !== undefined) {
    const trimmedPhone = updates.phone == null ? '' : String(updates.phone).trim();
    if (trimmedPhone) {
      const dupe = await prisma.employee.findFirst({ where: { phone: trimmedPhone, id: { not: current.id } }, select: { id: true } });
      if (dupe) return res.status(409).json({ message: `Mobile number ${trimmedPhone} is already in use by another employee.` });
    }
    data.phone = trimmedPhone;
  }

  if (data.managerId) {
    if (data.managerId === current.id) {
      return res.status(400).json({ message: 'An employee cannot be their own manager.' });
    }
    // Walk up the proposed new manager's chain — if it leads back to this employee, it's a cycle.
    let cursor = await prisma.employee.findUnique({ where: { id: data.managerId }, select: { id: true, managerId: true } });
    const seen = new Set();
    while (cursor) {
      if (cursor.id === current.id) {
        return res.status(400).json({ message: 'That would create a circular reporting line.' });
      }
      if (seen.has(cursor.id)) break; // guard against any pre-existing bad data
      seen.add(cursor.id);
      cursor = cursor.managerId ? await prisma.employee.findUnique({ where: { id: cursor.managerId }, select: { id: true, managerId: true } }) : null;
    }
  }

  let emp;
  try {
    emp = await prisma.employee.update({ where: { id: current.id }, data });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: `That ${duplicateField(err)} is already in use by another employee.` });
    }
    if (err.code === 'P2025') return res.status(404).json({ message: 'Employee not found.' });
    throw err;
  }

  // Keep the linked User login in sync so the employee's own Profile page
  // matches what an admin just set here.
  if (emp.userId) {
    const userUpdates = {};
    if (data.name !== undefined) userUpdates.name = data.name;
    if (data.email !== undefined) userUpdates.email = data.email;
    if (data.phone !== undefined) userUpdates.phone = data.phone;
    if (data.location !== undefined) userUpdates.location = data.location;
    if (Object.keys(userUpdates).length) {
      try {
        await prisma.user.update({ where: { id: emp.userId }, data: userUpdates });
      } catch (err) {
        console.error('[employees] could not sync User account:', err.message);
      }
    }
  }

  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'employees', recordId: emp.empId, detail: `Updated employee: ${emp.name}` });
  res.json({ employee: shape('Employee', emp) });
}

async function setStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'inactive', 'leave'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });

  const target = await prisma.employee.findUnique({ where: { id: String(req.params.id) }, select: { id: true, location: true } });
  if (!target) return res.status(404).json({ message: 'Employee not found.' });
  if (await isOutsideScope(req.user, target.location)) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const updated = await prisma.employee.update({ where: { id: target.id }, data: { status } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'employees', recordId: updated.empId, detail: `Set status of ${updated.name} to ${status}` });
  res.json({ employee: shape('Employee', updated) });
}

async function remove(req, res) {
  const emp = await prisma.employee.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, empId: true, name: true, location: true, userId: true },
  });
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });
  const scopeLoc = await resolveScopeLocation(req.user);
  if (scopeLoc && emp.location !== scopeLoc) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  // The employee's attendance and linked login account go with it.
  try {
    await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { employeeId: emp.id } }),
      prisma.employee.delete({ where: { id: emp.id } }),
      ...(emp.userId ? [prisma.user.deleteMany({ where: { id: emp.userId } })] : []),
    ]);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Employee not found.' });
    throw err;
  }

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'employees',
    recordId: emp.empId,
    detail: `Permanently deleted employee: ${emp.name}${emp.userId ? ' (and their login account)' : ''}`,
  });
  res.json({ message: 'Employee permanently deleted.' });
}

module.exports = { list, summary, getOne, create, update, setStatus, remove, yearsSince, nextId, orgChart };
