const fs = require('fs');
const path = require('path');
const { prisma, shape, shapeMany, sel, andWhere } = require('../db');
const writeAudit = require('../utils/audit');
const getSettings = require('../utils/getSettings');
const { updateSettingsSection, SETTINGS_DEFAULTS } = getSettings;
const { scopeEmployeeLocationFilter, isOutsideScope, resolveScopeLocation } = require('../utils/officeScope');
const { countWorkingDays } = require('../utils/workingDays');
const { LOP_BASES, parsePeriod, officeSettings, computeSlip, withTotals, renderSlipPdf, round2 } = require('../services/payroll');
const { computeBalance } = require('./leaveController');

// HR payroll: per-employee salary structures, monthly salary slips (draft ->
// published), and the payroll rules in Settings.payroll. Everything is limited
// to the viewer's office for an office-scoped admin (see officeScope.js).
// Publishing files the slip's PDF as a 'salary_slip' Document, which is how
// employees see it (My Documents). Audit entries never include amounts.

const PAYROLL_EMPLOYEE_STATUSES = ['active', 'leave'];
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// [{ name, amount, isBasic? }] from the client -> clean lines, or throws 400.
function cleanLines(lines, label, { allowBasic = false, keepSource = false } = {}) {
  if (!Array.isArray(lines)) throw badRequest(`${label} must be a list.`);
  if (lines.length > 40) throw badRequest(`${label}: at most 40 lines.`);
  const out = lines.map((l, i) => {
    const name = String(l?.name ?? '').trim();
    const amount = Number(l?.amount);
    if (!name) throw badRequest(`${label} line ${i + 1}: name is required.`);
    if (name.length > 80) throw badRequest(`${label} line ${i + 1}: name is too long.`);
    if (!Number.isFinite(amount) || amount < 0) throw badRequest(`${label} "${name}": amount must be 0 or more.`);
    const line = { name, amount: round2(amount) };
    if (allowBasic && l.isBasic) line.isBasic = true;
    if (keepSource) {
      line.source = ['structure', 'statutory', 'manual'].includes(l.source) ? l.source : 'manual';
      if (l.fullAmount !== undefined && Number.isFinite(Number(l.fullAmount))) line.fullAmount = round2(l.fullAmount);
    }
    return line;
  });
  if (allowBasic && out.filter((l) => l.isBasic).length > 1) throw badRequest('Only one earning can be marked as Basic.');
  return out;
}

// Employee in the viewer's office, or null.
async function scopedEmployee(user, employeeId) {
  const where = { id: String(employeeId) };
  await scopeEmployeeLocationFilter(where, user);
  return prisma.employee.findFirst({ where });
}

async function scopedSlip(user, id) {
  const slip = await prisma.salarySlip.findUnique({ where: { id: String(id) }, include: { employeeRef: { select: { location: true } } } });
  if (!slip || (await isOutsideScope(user, slip.employeeRef.location))) return null;
  return slip;
}

// ─── Settings ───────────────────────────────────────────────────────────────

// An office-scoped HR (admin/superadmin with a managed office) only sees and
// edits their own office: its card, and PF/ESI/PT only if that office uses
// Indian statutory deductions. Settings shared by every office (LOP basis,
// default lines, slip footer) are read-only for them; a company-wide admin
// (no managed office) sees and edits everything.
const STATUTORY_KEYS = ['pf', 'esi', 'pt'];
const SHARED_KEYS = ['lopBasis', 'defaultEarnings', 'defaultDeductions', 'footerNote'];

async function settingsScope(user) {
  const office = await resolveScopeLocation(user);
  return office ? { office, canEditShared: false } : { office: null, canEditShared: true };
}

function scopedPayroll(payroll, scope) {
  if (!scope.office) return { ...payroll, statutoryOffice: Object.values(payroll.offices).some((o) => o.statutory) };
  const own = payroll.offices[scope.office];
  const out = { offices: own ? { [scope.office]: own } : {} };
  if (own?.statutory) STATUTORY_KEYS.forEach((k) => { out[k] = payroll[k]; });
  SHARED_KEYS.forEach((k) => { out[k] = payroll[k]; });
  return { ...out, statutoryOffice: !!own?.statutory };
}

async function getPayrollSettings(req, res) {
  const [settings, scope] = await Promise.all([getSettings(), settingsScope(req.user)]);
  res.json({
    payroll: scopedPayroll(settings.payroll, scope),
    defaults: scopedPayroll(SETTINGS_DEFAULTS.payroll, scope),
    scope: { ...scope, statutory: scopedPayroll(settings.payroll, scope).statutoryOffice },
  });
}

function num(value, label, { min = 0, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${label} must be a number between ${min} and ${max === Infinity ? 'any' : max}.`);
  return n;
}

async function updatePayrollSettings(req, res) {
  const [current, scope] = await Promise.all([getSettings().then((s) => s.payroll), settingsScope(req.user)]);
  const b = req.body || {};
  const patch = {};

  if (scope.office) {
    const own = current.offices[scope.office];
    const otherOffice = Object.keys(b.offices || {}).find((name) => name !== scope.office);
    if (otherOffice) return res.status(403).json({ message: `You can only change payroll settings for ${scope.office}.` });
    if (!own?.statutory && STATUTORY_KEYS.some((k) => b[k] !== undefined)) {
      return res.status(403).json({ message: `PF, ESI and Professional Tax don't apply to ${scope.office}.` });
    }
    if (SHARED_KEYS.some((k) => b[k] !== undefined)) {
      return res.status(403).json({ message: 'Loss of pay, default lines and the slip footer apply to every office and can only be changed by a company-wide admin.' });
    }
    // The statutory switch decides which country's rules apply — company-wide admins only.
    if (b.offices?.[scope.office] && own) b.offices[scope.office].statutory = own.statutory;
  }

  if (b.offices !== undefined) {
    const offices = {};
    for (const [name, o] of Object.entries(b.offices || {})) {
      if (!current.offices[name]) throw badRequest(`Unknown office: ${name}`);
      const currency = String(o.currency || '').toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw badRequest(`${name}: currency must be a 3-letter code like INR.`);
      offices[name] = {
        currency,
        companyName: String(o.companyName || '').trim().slice(0, 191),
        address: String(o.address || '').trim().slice(0, 500),
        phone: String(o.phone || '').trim().slice(0, 50),
        statutory: !!o.statutory,
      };
    }
    patch.offices = { ...current.offices, ...offices };
  }
  if (b.pf !== undefined) {
    patch.pf = {
      enabled: !!b.pf.enabled,
      ratePct: num(b.pf.ratePct, 'PF rate', { max: 100 }),
      applyWageCeiling: !!b.pf.applyWageCeiling,
      wageCeiling: num(b.pf.wageCeiling, 'PF wage ceiling'),
    };
  }
  if (b.esi !== undefined) {
    patch.esi = { enabled: !!b.esi.enabled, ratePct: num(b.esi.ratePct, 'ESI rate', { max: 100 }), grossThreshold: num(b.esi.grossThreshold, 'ESI gross limit') };
  }
  if (b.pt !== undefined) {
    patch.pt = {
      enabled: !!b.pt.enabled,
      monthlyAmount: num(b.pt.monthlyAmount, 'Professional Tax amount'),
      annualIncomeThreshold: num(b.pt.annualIncomeThreshold, 'Professional Tax income limit'),
    };
  }
  if (b.lopBasis !== undefined) {
    if (!LOP_BASES.includes(b.lopBasis)) throw badRequest(`lopBasis must be one of ${LOP_BASES.join(', ')}.`);
    patch.lopBasis = b.lopBasis;
  }
  if (b.defaultEarnings !== undefined) {
    patch.defaultEarnings = cleanLines(b.defaultEarnings.map((l) => ({ ...l, amount: 0 })), 'Default earnings', { allowBasic: true }).map(({ name, isBasic }) => ({ name, ...(isBasic ? { isBasic } : {}) }));
  }
  if (b.defaultDeductions !== undefined) {
    patch.defaultDeductions = cleanLines(b.defaultDeductions.map((l) => ({ ...l, amount: 0 })), 'Default deductions').map(({ name }) => ({ name }));
  }
  if (b.footerNote !== undefined) patch.footerNote = String(b.footerNote || '').trim().slice(0, 300);

  const settings = await updateSettingsSection('payroll', patch);
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'payroll', recordId: 'settings', detail: `Updated payroll settings${scope.office ? ` for ${scope.office}` : ''}` });
  res.json({ payroll: scopedPayroll(settings.payroll, scope) });
}

// ─── Salary structures ──────────────────────────────────────────────────────

const STRUCTURE_EMPLOYEE_FIELDS = 'name empId dept desig location joined status avatarIndex';

function monthlyGross(structure) {
  return round2((structure?.earnings || []).reduce((t, l) => t + Number(l.amount || 0), 0));
}

async function listStructures(req, res) {
  const where = { status: { in: PAYROLL_EMPLOYEE_STATUSES } };
  await scopeEmployeeLocationFilter(where, req.user);
  const [employees, payroll] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: { ...sel('Employee', STRUCTURE_EMPLOYEE_FIELDS), salaryStructure: { select: { earnings: true, deductions: true, updatedAt: true } } },
      orderBy: { name: 'asc' },
    }),
    getSettings().then((s) => s.payroll),
  ]);
  const items = employees.map(({ salaryStructure, ...e }) => ({
    employee: shape('Employee', e),
    currency: officeSettings(payroll, e.location).currency,
    hasStructure: !!salaryStructure,
    monthlyGross: salaryStructure ? monthlyGross(salaryStructure) : 0,
    fixedDeductions: salaryStructure ? round2(salaryStructure.deductions.reduce((t, l) => t + Number(l.amount || 0), 0)) : 0,
    updatedAt: salaryStructure?.updatedAt || null,
  }));
  res.json({ items });
}

async function getStructure(req, res) {
  const employee = await scopedEmployee(req.user, req.params.employeeId);
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  const [row, payroll] = await Promise.all([
    prisma.salaryStructure.findUnique({ where: { employeeId: employee.id } }),
    getSettings().then((s) => s.payroll),
  ]);
  const office = officeSettings(payroll, employee.location);
  // No structure yet: start from the default component names with zero amounts.
  const structure = row
    ? shape('SalaryStructure', row)
    : {
        employeeId: employee.id,
        earnings: payroll.defaultEarnings.map((l) => ({ ...l, amount: 0 })),
        deductions: payroll.defaultDeductions.map((l) => ({ ...l, amount: 0 })),
        pfApplicable: true,
        esiApplicable: true,
        ptApplicable: true,
        pan: '',
        uan: '',
        epfNumber: '',
        esiNumber: '',
        address: '',
        bankName: '',
        bankAccount: '',
        ifsc: '',
      };
  res.json({
    employee: shape('Employee', employee),
    structure,
    isNew: !row,
    office: { name: office.name, currency: office.currency, statutory: office.statutory },
  });
}

async function saveStructure(req, res) {
  const employee = await scopedEmployee(req.user, req.params.employeeId);
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  const b = req.body || {};
  const earnings = cleanLines(b.earnings || [], 'Earnings', { allowBasic: true });
  if (!earnings.length) throw badRequest('Add at least one earning.');
  const deductions = cleanLines(b.deductions || [], 'Deductions');
  const pan = String(b.pan || '').trim().toUpperCase();
  const ifsc = String(b.ifsc || '').trim().toUpperCase();
  if (pan && !PAN_REGEX.test(pan)) throw badRequest('PAN should look like ABCDE1234F.');
  if (ifsc && !IFSC_REGEX.test(ifsc)) throw badRequest('IFSC should look like HDFC0001234.');
  const data = {
    earnings,
    deductions,
    pfApplicable: b.pfApplicable !== false,
    esiApplicable: b.esiApplicable !== false,
    ptApplicable: b.ptApplicable !== false,
    pan,
    uan: String(b.uan || '').trim().slice(0, 20),
    epfNumber: String(b.epfNumber || '').trim().toUpperCase().slice(0, 30),
    esiNumber: String(b.esiNumber || '').trim().slice(0, 30),
    address: String(b.address || '').trim().slice(0, 500) || null,
    bankName: String(b.bankName || '').trim().slice(0, 191),
    bankAccount: String(b.bankAccount || '').replace(/\s+/g, '').slice(0, 50),
    ifsc,
    updatedById: String(req.user._id),
  };
  const row = await prisma.salaryStructure.upsert({ where: { employeeId: employee.id }, update: data, create: { ...data, employeeId: employee.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'payroll', recordId: employee.id, detail: `Saved salary structure for ${employee.name} (${employee.empId})` });
  res.json({ structure: shape('SalaryStructure', row) });
}

async function deleteStructure(req, res) {
  const employee = await scopedEmployee(req.user, req.params.employeeId);
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  const { count } = await prisma.salaryStructure.deleteMany({ where: { employeeId: employee.id } });
  if (!count) return res.status(404).json({ message: 'This employee has no salary structure.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'payroll', recordId: employee.id, detail: `Removed salary structure for ${employee.name} (${employee.empId})` });
  res.json({ message: 'Salary structure removed.' });
}

// ─── Slip calculation helpers ───────────────────────────────────────────────

// Days without pay before the employee joined, in units of the LOP basis.
async function preJoinDays(joined, period, lopBasis) {
  const j = new Date(joined);
  if (j < period.start) return 0;
  const before = j.getUTCDate() - 1;
  if (lopBasis === 'working') return before > 0 ? countWorkingDays(period.year, period.month, before) : 0;
  if (lopBasis === 'fixed30') return Math.min(before, 30);
  return before;
}

async function basisDaysFor(period, lopBasis) {
  if (lopBasis === 'working') return countWorkingDays(period.year, period.month);
  if (lopBasis === 'fixed30') return 30;
  return period.daysInMonth;
}

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// Days off per employee in the period, split by whether the portal has an
// approved leave request covering that day. Salary is never cut for approved
// leave: only `unpaid` days (marked absent/leave with no approved request)
// become LOP. -> Map(employeeId -> { off, approved, unpaid })
async function daysOffByEmployee(employeeIds, period) {
  if (!employeeIds.length) return new Map();
  const [offRows, approvedLeaves] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds }, status: { in: ['absent', 'leave'] }, date: { gte: period.start, lt: period.end } },
      select: { employeeId: true, date: true },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, status: 'approved', startDate: { lt: period.end }, endDate: { gte: period.start } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);
  const covered = (employeeId, date) => {
    const k = dayKey(date);
    return approvedLeaves.some((l) => l.employeeId === employeeId && dayKey(l.startDate) <= k && k <= dayKey(l.endDate));
  };
  const result = new Map(employeeIds.map((id) => [id, { off: 0, approved: 0, unpaid: 0 }]));
  for (const row of offRows) {
    const r = result.get(row.employeeId);
    r.off++;
    if (covered(row.employeeId, row.date)) r.approved++;
    else r.unpaid++;
  }
  return result;
}

const NO_DAYS_OFF = { off: 0, approved: 0, unpaid: 0 };

function employeeSnapshot(employee, structure) {
  return {
    name: employee.name,
    empId: employee.empId,
    desig: employee.desig,
    dept: employee.dept,
    joined: employee.joined,
    pan: structure.pan || '',
    uan: structure.uan || '',
    epfNumber: structure.epfNumber || '',
    esiNumber: structure.esiNumber || '',
    address: structure.address || '',
    bankName: structure.bankName || '',
    bankAccount: structure.bankAccount || '',
    ifsc: structure.ifsc || '',
    monthlyCtc: monthlyGross(structure),
  };
}

// Builds the calculated part of a slip for one employee. `lopOverride` (days)
// replaces the attendance-based count; `manualLines` are kept from a draft.
async function calculate({ employee, structure, payroll, period, daysOff = NO_DAYS_OFF, lopOverride, manualLines }) {
  const office = officeSettings(payroll, employee.location);
  const basisDays = await basisDaysFor(period, payroll.lopBasis);
  const lopDays = lopOverride !== undefined ? Number(lopOverride) : daysOff.unpaid + (await preJoinDays(employee.joined, period, payroll.lopBasis));
  const result = computeSlip({ structure, payroll, office, period, lopDays, basisDays, manualLines });

  // Shown on the slip: working days in the month, days actually worked
  // (working days minus absences and days before joining), and leave balances.
  const workingDays = await countWorkingDays(period.year, period.month);
  const preJoinWorking = await preJoinDays(employee.joined, period, 'working');
  const daysWorked = Math.max(workingDays - daysOff.off - preJoinWorking, 0);
  const leaveBalances = await computeBalance(employee.id, period.year);
  return { office, ...result, workingDays, daysWorked, paidLeaveDays: daysOff.approved, leaveBalances };
}

function manualOnly(slip) {
  return {
    earnings: (slip.earnings || []).filter((l) => l.source === 'manual'),
    deductions: (slip.deductions || []).filter((l) => l.source === 'manual'),
  };
}

function slipData({ employee, structure, period, calc, userId }) {
  return {
    currency: calc.office.currency,
    office: calc.office.name,
    employeeInfo: employeeSnapshot(employee, structure),
    daysInMonth: period.daysInMonth,
    workingDays: calc.workingDays,
    daysWorked: calc.daysWorked,
    paidLeaveDays: calc.paidLeaveDays,
    leaveBalances: calc.leaveBalances,
    paidDays: calc.paidDays,
    lopDays: calc.lopDays,
    earnings: calc.earnings,
    deductions: calc.deductions,
    grossEarnings: calc.grossEarnings,
    totalDeductions: calc.totalDeductions,
    netPay: calc.netPay,
    generatedById: userId,
  };
}

// ─── Slips ──────────────────────────────────────────────────────────────────

const SLIP_LIST_SELECT = {
  id: true, employeeId: true, period: true, status: true, currency: true, office: true, daysInMonth: true, paidDays: true,
  lopDays: true, grossEarnings: true, totalDeductions: true, netPay: true, publishedAt: true, documentId: true, updatedAt: true,
  employeeRef: { select: sel('Employee', 'name empId dept desig avatarIndex') },
};

async function listSlips(req, res) {
  const period = parsePeriod(req.query.period);
  if (!period) return res.status(400).json({ message: 'period (YYYY-MM) is required.' });
  const where = { period: req.query.period };
  if (req.query.status) {
    if (!['draft', 'published'].includes(req.query.status)) return res.json({ items: [] });
    where.status = req.query.status;
  }
  const empWhere = {};
  await scopeEmployeeLocationFilter(empWhere, req.user);
  if (Object.keys(empWhere).length) andWhere(where, { employeeRef: empWhere });
  const rows = await prisma.salarySlip.findMany({ where, select: SLIP_LIST_SELECT, orderBy: { employeeRef: { name: 'asc' } } });
  res.json({ items: shapeMany('SalarySlip', rows) });
}

async function getSlip(req, res) {
  const slip = await scopedSlip(req.user, req.params.id);
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });
  const { employeeRef, ...rest } = slip;
  res.json({ slip: shape('SalarySlip', rest) });
}

async function generate(req, res) {
  const period = parsePeriod(req.body?.period);
  if (!period) return res.status(400).json({ message: 'period (YYYY-MM) is required.' });
  const refreshDrafts = req.body?.refreshDrafts === true;

  const empWhere = { status: { in: PAYROLL_EMPLOYEE_STATUSES } };
  if (Array.isArray(req.body?.employeeIds) && req.body.employeeIds.length) empWhere.id = { in: req.body.employeeIds.map(String) };
  await scopeEmployeeLocationFilter(empWhere, req.user);

  const [employees, payroll] = await Promise.all([
    prisma.employee.findMany({ where: empWhere, include: { salaryStructure: true, salarySlips: { where: { period: req.body.period } } }, orderBy: { name: 'asc' } }),
    getSettings().then((s) => s.payroll),
  ]);
  const daysOff = await daysOffByEmployee(employees.map((e) => e.id), period);

  const result = { created: 0, refreshed: 0, skipped: [] };
  for (const employee of employees) {
    const existing = employee.salarySlips[0];
    const skip = (reason) => result.skipped.push({ employeeId: employee.id, name: employee.name, reason });
    if (!employee.salaryStructure) { skip('No salary structure'); continue; }
    if (new Date(employee.joined) >= period.end) { skip('Joined after this month'); continue; }
    if (existing?.status === 'published') { skip('Already published'); continue; }
    if (existing && !refreshDrafts) { skip('Draft already exists'); continue; }

    const structure = shape('SalaryStructure', employee.salaryStructure);
    const calc = await calculate({
      employee,
      structure,
      payroll,
      period,
      daysOff: daysOff.get(employee.id),
      manualLines: existing ? manualOnly(existing) : undefined,
    });
    const data = slipData({ employee, structure, period, calc, userId: String(req.user._id) });
    if (existing) {
      await prisma.salarySlip.update({ where: { id: existing.id }, data });
      result.refreshed++;
    } else {
      await prisma.salarySlip.create({ data: { ...data, employeeId: employee.id, period: req.body.period } });
      result.created++;
    }
  }

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'payroll',
    recordId: req.body.period,
    detail: `Generated salary slips for ${period.label}: ${result.created} created, ${result.refreshed} refreshed, ${result.skipped.length} skipped`,
  });
  res.json(result);
}

// HR edits a draft: any line, LOP days, notes. Totals are recomputed here.
async function updateSlip(req, res) {
  const slip = await scopedSlip(req.user, req.params.id);
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });
  if (slip.status === 'published') return res.status(409).json({ message: 'This slip is published. Revert it to draft before editing.' });

  const b = req.body || {};
  const earnings = b.earnings !== undefined ? cleanLines(b.earnings, 'Earnings', { keepSource: true, allowBasic: true }) : slip.earnings;
  const deductions = b.deductions !== undefined ? cleanLines(b.deductions, 'Deductions', { keepSource: true }) : slip.deductions;
  let lopDays = Number(slip.lopDays);
  if (b.lopDays !== undefined) {
    lopDays = Number(b.lopDays);
    if (!Number.isFinite(lopDays) || lopDays < 0 || lopDays > slip.daysInMonth) throw badRequest(`LOP days must be between 0 and ${slip.daysInMonth}.`);
  }
  const totals = withTotals({ earnings, deductions, lopDays, daysInMonth: slip.daysInMonth });
  const row = await prisma.salarySlip.update({
    where: { id: slip.id },
    data: { ...totals, notes: b.notes !== undefined ? String(b.notes || '').trim().slice(0, 1000) || null : slip.notes },
  });
  res.json({ slip: shape('SalarySlip', row) });
}

// Rebuilds a draft's structure and PF/ESI/PT lines from the current salary
// structure and settings, keeping HR's manual lines. Optional `lopDays`
// overrides the attendance count.
async function recalculateSlip(req, res) {
  const slip = await scopedSlip(req.user, req.params.id);
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });
  if (slip.status === 'published') return res.status(409).json({ message: 'This slip is published. Revert it to draft first.' });
  const period = parsePeriod(slip.period);
  const [employee, payroll] = await Promise.all([
    prisma.employee.findUnique({ where: { id: slip.employeeId }, include: { salaryStructure: true } }),
    getSettings().then((s) => s.payroll),
  ]);
  if (!employee.salaryStructure) return res.status(400).json({ message: 'This employee no longer has a salary structure.' });

  let lopOverride;
  if (req.body?.lopDays !== undefined && req.body.lopDays !== null && req.body.lopDays !== '') {
    lopOverride = Number(req.body.lopDays);
    if (!Number.isFinite(lopOverride) || lopOverride < 0 || lopOverride > period.daysInMonth) throw badRequest(`LOP days must be between 0 and ${period.daysInMonth}.`);
  }
  const daysOff = await daysOffByEmployee([employee.id], period);
  const structure = shape('SalaryStructure', employee.salaryStructure);
  const calc = await calculate({ employee, structure, payroll, period, daysOff: daysOff.get(employee.id), lopOverride, manualLines: manualOnly(slip) });
  const row = await prisma.salarySlip.update({ where: { id: slip.id }, data: slipData({ employee, structure, period, calc, userId: String(req.user._id) }) });
  res.json({ slip: shape('SalarySlip', row) });
}

async function deleteSlip(req, res) {
  const slip = await scopedSlip(req.user, req.params.id);
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });
  if (slip.status === 'published') return res.status(409).json({ message: 'Revert this slip to draft before deleting it.' });
  await prisma.salarySlip.delete({ where: { id: slip.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'payroll', recordId: slip.id, detail: `Deleted draft salary slip ${slip.period} for ${slip.employeeInfo?.name || slip.employeeId}` });
  res.json({ message: 'Draft deleted.' });
}

// The built-in logo ships with the client (client/public/images); an uploaded
// logo (Developer Panel) is already a data URL.
const DEFAULT_LOGO = path.join(__dirname, '../../../client/public/images/AI-horizontal-logo-R-gray-454x116-1.png');
let defaultLogoDataUrl;
function defaultLogo() {
  if (defaultLogoDataUrl === undefined) {
    defaultLogoDataUrl = fs.existsSync(DEFAULT_LOGO) ? `data:image/png;base64,${fs.readFileSync(DEFAULT_LOGO).toString('base64')}` : '';
  }
  return defaultLogoDataUrl;
}

async function companyFor(slip) {
  const settings = await getSettings();
  const office = officeSettings(settings.payroll, slip.office);
  const logo = settings.branding.logoUrl;
  return {
    company: {
      name: office.companyName || settings.branding.companyName,
      address: office.address,
      phone: office.phone,
      logoDataUrl: logo?.startsWith('data:') ? logo : defaultLogo(),
      primaryColor: settings.branding.primaryColor,
      secondaryColor: settings.branding.secondaryColor,
    },
    footerNote: settings.payroll.footerNote,
  };
}

// Creates the PDF Document and marks the slip published, in one transaction.
async function publishOne(slipRow, user) {
  const slip = shape('SalarySlip', slipRow);
  const pdf = await renderSlipPdf({ ...slip, status: 'published' }, await companyFor(slip));
  const period = parsePeriod(slip.period);
  const empId = slip.employeeInfo?.empId || slip.employeeId;
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        employeeId: slip.employeeId,
        name: `Salary Slip – ${period.label}`,
        category: 'salary_slip',
        fileName: `salary-slip-${slip.period}-${empId}.pdf`,
        fileType: 'application/pdf',
        fileUrl: `data:application/pdf;base64,${pdf.toString('base64')}`,
        uploadedById: String(user._id),
      },
    });
    return tx.salarySlip.update({
      where: { id: slip.id },
      data: { status: 'published', documentId: doc.id, publishedById: String(user._id), publishedAt: new Date() },
    });
  });
}

async function publishSlip(req, res) {
  const slip = await scopedSlip(req.user, req.params.id);
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });
  if (slip.status === 'published') return res.status(409).json({ message: 'This slip is already published.' });
  const { employeeRef, ...row } = slip;
  const updated = await publishOne(row, req.user);
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'payroll', recordId: slip.id, detail: `Published salary slip ${slip.period} for ${slip.employeeInfo?.name || slip.employeeId}` });
  res.json({ slip: shape('SalarySlip', updated) });
}

// Publishes every draft for a month in the viewer's office.
async function publishAll(req, res) {
  const period = parsePeriod(req.body?.period);
  if (!period) return res.status(400).json({ message: 'period (YYYY-MM) is required.' });
  const where = { period: req.body.period, status: 'draft' };
  const empWhere = {};
  await scopeEmployeeLocationFilter(empWhere, req.user);
  if (Object.keys(empWhere).length) andWhere(where, { employeeRef: empWhere });
  const drafts = await prisma.salarySlip.findMany({ where });
  let published = 0;
  const failed = [];
  for (const draft of drafts) {
    try {
      await publishOne(draft, req.user);
      published++;
    } catch (err) {
      console.error('[payroll] publish failed for slip', draft.id, err.message);
      failed.push({ id: draft.id, name: draft.employeeInfo?.name || draft.employeeId });
    }
  }
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'payroll', recordId: req.body.period, detail: `Published ${published} salary slip(s) for ${period.label}` });
  res.json({ published, failed });
}

// Takes a published slip back to draft and removes its PDF from Documents.
async function unpublishSlip(req, res) {
  const slip = await scopedSlip(req.user, req.params.id);
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });
  if (slip.status !== 'published') return res.status(409).json({ message: 'This slip is not published.' });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.salarySlip.update({ where: { id: slip.id }, data: { status: 'draft', documentId: null, publishedAt: null, publishedById: null } });
    if (slip.documentId) await tx.document.deleteMany({ where: { id: slip.documentId } });
    return row;
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'payroll', recordId: slip.id, detail: `Reverted salary slip ${slip.period} for ${slip.employeeInfo?.name || slip.employeeId} to draft` });
  res.json({ slip: shape('SalarySlip', updated) });
}

// PDF preview/download for HR (drafts carry a DRAFT mark).
async function slipPdf(req, res) {
  const slip = await scopedSlip(req.user, req.params.id);
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });
  const { employeeRef, ...row } = slip;
  const shaped = shape('SalarySlip', row);
  const pdf = await renderSlipPdf(shaped, await companyFor(shaped));
  const empId = shaped.employeeInfo?.empId || shaped.employeeId;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="salary-slip-${shaped.period}-${empId}.pdf"`);
  res.send(pdf);
}

module.exports = {
  getPayrollSettings,
  updatePayrollSettings,
  listStructures,
  getStructure,
  saveStructure,
  deleteStructure,
  listSlips,
  getSlip,
  generate,
  updateSlip,
  recalculateSlip,
  deleteSlip,
  publishSlip,
  publishAll,
  unpublishSlip,
  slipPdf,
};
