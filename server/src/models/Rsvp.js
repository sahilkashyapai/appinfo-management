const { Schema, model } = require('mongoose');

const rsvpSchema = new Schema(
  {
    eventRef: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    status: { type: String, enum: ['yes', 'maybe', 'no'], required: true },
    respondedAt: { type: Date, default: Date.now },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rsvpSchema.index({ eventRef: 1, employeeRef: 1 }, { unique: true });

module.exports = model('Rsvp', rsvpSchema);
