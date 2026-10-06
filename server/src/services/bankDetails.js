const prisma = require('../db/prisma');

// Finding and writing an employee's BankDetails, which may be linked by the
// login (sign-up, before approval) and/or the employee record.

// The row for a login and/or employee, if any.
async function findBankDetails({ userId, employeeId }) {
  const or = [];
  if (employeeId) or.push({ employeeId: String(employeeId) });
  if (userId) or.push({ userId: String(userId) });
  if (!or.length) return null;
  return prisma.bankDetails.findFirst({ where: { OR: or } });
}

// The login linked to an employee, if they have one.
async function userIdForEmployee(employee) {
  if (employee.userId) return employee.userId;
  const u = await prisma.user.findFirst({ where: { employeeId: employee.id }, select: { id: true } });
  return u?.id || null;
}

// Creates or updates the row, filling in whichever link is missing.
async function saveBankDetails({ userId, employeeId, data, db = prisma }) {
  const existing = await findBankDetails({ userId, employeeId });
  const links = {};
  if (userId && !existing?.userId) links.userId = String(userId);
  if (employeeId && !existing?.employeeId) links.employeeId = String(employeeId);
  if (existing) return db.bankDetails.update({ where: { id: existing.id }, data: { ...data, ...links } });
  return db.bankDetails.create({ data: { ...data, ...links } });
}

module.exports = { findBankDetails, userIdForEmployee, saveBankDetails };
