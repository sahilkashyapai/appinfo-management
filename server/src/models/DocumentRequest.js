const { Schema, model } = require('mongoose');

const DOCUMENT_REQUEST_TYPES = ['salary_slip', 'experience_letter', 'relieving_letter', 'salary_certificate', 'form16', 'other'];

const documentRequestSchema = new Schema(
  {
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    type: { type: String, enum: DOCUMENT_REQUEST_TYPES, required: true },
    period: { type: String, default: '', trim: true }, // e.g. "2026-06" for a payslip month
    note: { type: String, default: '', trim: true },
    status: { type: String, enum: ['pending', 'fulfilled', 'rejected'], default: 'pending' },
    documentRef: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    decidedByRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decisionNote: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

documentRequestSchema.index({ employeeRef: 1, status: 1 });

module.exports = model('DocumentRequest', documentRequestSchema);
module.exports.DOCUMENT_REQUEST_TYPES = DOCUMENT_REQUEST_TYPES;
