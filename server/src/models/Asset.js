const { Schema, model } = require('mongoose');

const assetSchema = new Schema(
  {
    employeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ['laptop', 'mobile', 'id_card', 'access_card', 'other'], default: 'other' },
    serialNumber: { type: String, default: '', trim: true },
    status: { type: String, enum: ['unassigned', 'assigned', 'returned', 'damaged', 'lost'], default: 'unassigned' },
    assignedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

assetSchema.index({ employeeRef: 1 });
assetSchema.index({ serialNumber: 1 });

module.exports = model('Asset', assetSchema);
