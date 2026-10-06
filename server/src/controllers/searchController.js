const { prisma, shapeMany, sel, likeSafe } = require('../db');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');
const { scopeEmployeeLocationFilter } = require('../utils/officeScope');

async function search(req, res) {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ employees: [], events: [], departments: [] });

  // Substring match; the MySQL collation makes it case-insensitive like the old /q/i.
  const contains = { contains: likeSafe(q) };
  const employeeWhere = { OR: [{ name: contains }, { dept: contains }] };
  await excludeSuperadminEmployees(employeeWhere);
  await scopeEmployeeLocationFilter(employeeWhere, req.user);
  const [employees, events, departments] = await Promise.all([
    prisma.employee.findMany({ where: employeeWhere, take: 4, select: sel('Employee', 'name dept avatarIndex') }),
    prisma.event.findMany({ where: { title: contains }, take: 2, select: sel('Event', 'title date emoji') }),
    prisma.department.findMany({ where: { name: contains }, take: 2, select: sel('Department', 'name icon') }),
  ]);

  res.json({
    employees: shapeMany('Employee', employees),
    events: shapeMany('Event', events),
    departments: shapeMany('Department', departments),
  });
}

module.exports = { search };
