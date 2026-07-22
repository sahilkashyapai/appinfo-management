const { Schema, model } = require('mongoose');

const documentSchema = new Schema(
  {
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ['offer_letter', 'id_proof', 'certificate', 'other'], default: 'other' },
    fileName: { type: String, default: '' },
    fileType: { type: String, default: '' },
    fileUrl: { type: String, required: true }, // base64 data URL
    uploadedByRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

documentSchema.index({ employeeRef: 1, createdAt: -1 });

module.exports = model('Document', documentSchema);
