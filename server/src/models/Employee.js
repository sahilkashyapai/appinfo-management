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
      enum: [
        'President & CTO', 'COO / SVP / VP', 'Director & VP', 'Director', 'Senior Manager', 'Manager',
        'Team Lead', 'Senior Engineer', 'Engineer / Developer', 'Associate', 'Intern',
        'HR Manager / HR Head', 'HR Executive', 'Front Office Executive',
      ],
      default: 'Engineer / Developer',
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
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

employeeSchema.index({ name: 'text', email: 'text', dept: 'text' });

module.exports = model('Employee', employeeSchema);
