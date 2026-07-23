const { Schema, model } = require('mongoose');

const attendanceCorrectionRequestSchema = new Schema(
  {
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true }, // normalized to midnight (start of day)
    currentStatus: { type: String, enum: ['office', 'wfh', 'leave', 'absent', 'not_marked'], required: true },
    requestedStatus: { type: String, enum: ['office', 'wfh', 'leave', 'absent'], required: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    decidedByRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decisionNote: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

attendanceCorrectionRequestSchema.index({ employeeRef: 1, date: 1 });

module.exports = model('AttendanceCorrectionRequest', attendanceCorrectionRequestSchema);
