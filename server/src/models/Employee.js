const { Schema, model } = require('mongoose');

const employeeSchema = new Schema(
  {
    empId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    deptRef: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    dept: { type: String, required: true }, // denormalized department name, kept in sync on write
    desig: { type: String, required: true, trim: true },
    roleLabel: {
      type: String,
      enum: ['CEO', 'CTO', 'CFO', 'HR', 'Team Lead', 'Manager', 'Senior Employee', 'Employee', 'Intern'],
      default: 'Employee',
    },
    joined: { type: Date, required: true },
    dob: { type: Date, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive', 'leave'], default: 'active' },
    managerRef: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    userRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    avatarIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
);

employeeSchema.index({ name: 'text', email: 'text', dept: 'text' });

module.exports = model('Employee', employeeSchema);
