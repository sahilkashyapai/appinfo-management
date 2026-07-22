const { Schema, model } = require('mongoose');

const leaveCommentSchema = new Schema(
  {
    authorRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const leaveRequestSchema = new Schema(
  {
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    type: { type: String, enum: ['casual', 'sick', 'earned'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true }, // inclusive calendar-day count, computed server-side
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'on_hold', 'approved', 'rejected', 'cancelled'], default: 'pending' },
    approverRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approverNote: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    comments: [leaveCommentSchema],
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employeeRef: 1, status: 1 });
leaveRequestSchema.index({ employeeRef: 1, startDate: 1 });

module.exports = model('LeaveRequest', leaveRequestSchema);
