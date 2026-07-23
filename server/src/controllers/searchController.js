const Employee = require('../models/Employee');
const Event = require('../models/Event');
const Department = require('../models/Department');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');

async function search(req, res) {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ employees: [], events: [], departments: [] });

  const re = new RegExp(q, 'i');
  const employeeFilter = { $or: [{ name: re }, { dept: re }] };
  await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');
  const [employees, events, departments] = await Promise.all([
    Employee.find(employeeFilter).limit(4).select('name dept avatarIndex'),
    Event.find({ title: re }).limit(2).select('title date emoji'),
    Department.find({ name: re }).limit(2).select('name emoji'),
  ]);

  res.json({ employees, events, departments });
}

module.exports = { search };
