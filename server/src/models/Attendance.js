const { Schema, model } = require('mongoose');

const attendanceSchema = new Schema(
  {
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true }, // normalized to midnight (start of day)
    status: { type: String, enum: ['office', 'wfh', 'leave', 'absent'], required: true },
    note: { type: String, default: '' },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One entry per employee per day.
attendanceSchema.index({ employeeRef: 1, date: 1 }, { unique: true });

module.exports = model('Attendance', attendanceSchema);
