// A proadmin gets every permission an admin/superadmin has, plus its own
// exclusive power to grant/revoke the superadmin role (see adminController.js).
export const ADMIN_ROLES = ['proadmin', 'superadmin', 'admin'];
export const APPROVER_ROLES = ['proadmin', 'superadmin', 'admin'];
export const LOGIN_ACCESS_ROLES = ['proadmin', 'superadmin', 'admin'];

// Only these two can set office/branch scoping - on their own profile (see
// ProfilePage) or on another admin/superadmin's account (see adminController's
// `canScope`). A plain admin never manages branch/office assignment.
export const BRANCH_EDITOR_ROLES = ['proadmin', 'superadmin'];

// A proadmin outranks superadmin, so anywhere a feature was gated to
// "superadmin only" - deleting an employee record, editing an Employee ID,
// SMTP/security settings, clearing dummy/time-tracking data - a proadmin gets
// it too. Also covers the "no Employee record" exemptions (time tracking
// doesn't apply to either role, since neither has a tracked employee identity).
export const SUPER_TIER_ROLES = ['proadmin', 'superadmin'];

// A standalone, narrow-purpose role: no HR/admin data access, just company
// branding (logo/name/favicon/banner) via the Developer Panel.
export const DEVELOPER_ROLES = ['proadmin', 'developer'];
