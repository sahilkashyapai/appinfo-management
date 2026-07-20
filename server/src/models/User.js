const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'hr', 'manager', 'employee'], default: 'employee' },
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    isActive: { type: Boolean, default: true },
    avatarIndex: { type: Number, default: 0 },

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
    totpEnabled: this.totpEnabled,
    lastLogin: this.lastLogin,
    phone: this.phone,
    department: this.department,
    location: this.location,
    branch: this.branch,
    approvalStatus: this.approvalStatus,
  };
};

module.exports = model('User', userSchema);
