const { Schema, model } = require('mongoose');

// One document per user per calendar day — a manually start/pause/stop-able work timer.
const timeLogSchema = new Schema(
  {
    userRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true }, // normalized to midnight (start of day)
    startedAt: { type: Date, required: true },
    stoppedAt: { type: Date, default: null },
    status: { type: String, enum: ['running', 'paused', 'stopped'], default: 'running' },
    pausedAt: { type: Date, default: null }, // set while status === 'paused'
    totalPausedMs: { type: Number, default: 0 },
    autoStopped: { type: Boolean, default: false },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

// One timer per employee per day.
timeLogSchema.index({ userRef: 1, date: 1 }, { unique: true });

module.exports = model('TimeLog', timeLogSchema);
