const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['proadmin', 'superadmin', 'admin', 'developer', 'employee'], default: 'employee' },
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },

    // Only meaningful for role 'superadmin': restricts that account to one office
    // (must match an OFFICE_LOCATIONS value, e.g. 'Mohali, India'). Empty string
    // means unrestricted/global — every superadmin was global before proadmin
    // existed, and stays that way unless a proadmin explicitly scopes them.
    // Set exclusively by a proadmin (see adminController) — a superadmin can
    // never scope or unscope themselves or anyone else.
    managedLocation: { type: String, default: '' },

    // Coarser-grained companion to managedLocation — picking a branch here
    // (see BRANCH_LOCATIONS) auto-derives managedLocation to that branch's
    // office. Same rules as managedLocation: superadmin-only, proadmin-set.
    managedBranch: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    avatarIndex: { type: Number, default: 0 },
    avatarUrl: { type: String, default: '' },

    // Display-only profile fields, mainly for accounts (e.g. Super Admin) with no Employee record.
    phone: { type: String, default: '' },
    department: { type: String, default: '' },
    location: { type: String, default: '' },
    branch: { type: String, default: 'Headquarters' },

    // Populated for self-registered accounts (see auth/register) pending HR/admin review.
    empId: { type: String, trim: true, default: '' },
    dob: { type: Date, default: null },
    joined: { type: Date, default: null },
    approvalStatus: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'approved' },
    rejectionReason: { type: String, default: '' },

    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },

    totpEnabled: { type: Boolean, default: false },
    totpSecret: { type: String, default: null },

    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },

    isDemo: { type: Boolean, default: false },

    // True when this login pre-existed as a plain employee account and was later
    // promoted to Admin (see adminController.create) rather than created solely
    // for admin access — determines whether removing admin access deletes the
    // login outright or just demotes it back to 'employee' (see adminController.remove).
    promotedAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    employeeRef: this.employeeRef,
    isActive: this.isActive,
    avatarIndex: this.avatarIndex,
    avatarUrl: this.avatarUrl,
    totpEnabled: this.totpEnabled,
    lastLogin: this.lastLogin,
    phone: this.phone,
    department: this.department,
    location: this.location,
    managedLocation: this.managedLocation,
    managedBranch: this.managedBranch,
    branch: this.branch,
    approvalStatus: this.approvalStatus,
  };
};

module.exports = model('User', userSchema);
