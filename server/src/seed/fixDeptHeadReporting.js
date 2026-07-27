// One-off correction: connects every department's top person to the company's
// Director & VP, so the Org Chart has no disconnected/misrouted branches.
//   - A department with an internal Manager (dept head) but no managerRef set
//     on that Manager gets pointed at the Director & VP (mirrors depts that
//     already do this correctly, e.g. Design's Manager -> Director & VP).
//   - A department with no internal Manager or Team Lead has no one to
//     naturally head it — its most senior employee gets pointed at the
//     Director & VP directly instead of a leftover cross-department manager.
// Employees whose department already has a Manager/Team Lead they report to
// within the same department are left untouched.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const { ROLE_LABEL_ORDER } = require('../utils/roleLabels');

// Legacy free-text titles that predate the Role Label dropdown — not in
// ROLE_LABEL_ORDER, but clearly not entry-level either. Mapped to their
// closest canonical rank purely for this comparison, without touching the
// stored roleLabel itself.
const LEGACY_RANK_ALIASES = { CEO: 'President & CTO', 'Senior Employee': 'Senior Engineer', Employee: 'Engineer / Developer' };

function rank(roleLabel) {
  const canonical = LEGACY_RANK_ALIASES[roleLabel] || roleLabel;
  const idx = ROLE_LABEL_ORDER.indexOf(canonical);
  return idx === -1 ? ROLE_LABEL_ORDER.length : idx;
}

async function main() {
  await connectDB();

  const vp = await Employee.findOne({ roleLabel: 'Director & VP', status: 'active' });
  if (!vp) throw new Error('No active employee with roleLabel "Director & VP" found — nothing to attach to.');

  const employees = await Employee.find({ status: 'active' }, 'name dept roleLabel managerRef');
  const byDept = {};
  employees.forEach((e) => {
    if (String(e._id) === String(vp._id)) return; // the VP doesn't report to themselves
    if (e.dept === vp.dept) return; // the executive suite (CEO etc.) isn't a regular team — leave it alone
    byDept[e.dept] = byDept[e.dept] || [];
    byDept[e.dept].push(e);
  });

  const updates = [];
  for (const [dept, list] of Object.entries(byDept)) {
    const hasInternalHead = list.some((e) => ['Manager', 'Team Lead'].includes(e.roleLabel));
    if (hasInternalHead) {
      // Dept head (the Manager) should report to the VP if not already reporting to someone.
      const head = list.find((e) => e.roleLabel === 'Manager');
      if (head && !head.managerRef) updates.push({ emp: head, reason: `${dept} dept head has no manager` });
    } else {
      // No internal Manager/Team Lead — the most senior person here reports to the VP.
      const top = [...list].sort((a, b) => rank(a.roleLabel) - rank(b.roleLabel))[0];
      if (top && String(top.managerRef || '') !== String(vp._id)) {
        updates.push({ emp: top, reason: `${dept} has no internal Manager/Team Lead` });
      }
    }
  }

  for (const { emp, reason } of updates) {
    await Employee.updateOne({ _id: emp._id }, { managerRef: vp._id });
    console.log(`[fix] ${emp.name} (${emp.dept}) -> ${vp.name} (Director & VP) — ${reason}`);
  }
  if (!updates.length) console.log('[fix] nothing to update — every department is already correctly connected.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[fix] failed:', err);
  process.exit(1);
});
