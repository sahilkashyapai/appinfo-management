// A proadmin gets every permission an admin/superadmin has, plus its own
// exclusive power to grant/revoke the superadmin role (see adminController.js).
const ADMIN_ROLES = ['proadmin', 'superadmin', 'admin'];
const APPROVER_ROLES = ['proadmin', 'superadmin', 'admin'];
const LOGIN_ACCESS_ROLES = ['proadmin', 'superadmin', 'admin'];

// Only these two can set office/branch scoping - on their own profile (see
// profileController.updateProfile) or on another admin/superadmin's account
// (see adminController's `canScope`). A plain admin never manages branch/office
// assignment.
const BRANCH_EDITOR_ROLES = ['proadmin', 'superadmin'];

// A proadmin outranks superadmin, so anywhere a feature was gated to
// "superadmin only" - SMTP/security/time-tracking-policy settings, clearing
// dummy/time-tracking data - a proadmin gets it too. Also covers the "no
// Employee record" exemptions (time tracking doesn't apply to either role,
// since neither has a tracked employee identity).
const SUPER_TIER_ROLES = ['proadmin', 'superadmin'];

// A standalone, narrow-purpose role: no HR/admin data access, just company
// branding (logo/name/favicon/banner) via the Developer Panel (see
// settingsController's branding endpoints). Kept separate from ADMIN_ROLES
// on purpose so a developer account can't see employees/payroll/etc.
const DEVELOPER_ROLES = ['proadmin', 'developer'];

module.exports = { ADMIN_ROLES, APPROVER_ROLES, LOGIN_ACCESS_ROLES, BRANCH_EDITOR_ROLES, SUPER_TIER_ROLES, DEVELOPER_ROLES };
