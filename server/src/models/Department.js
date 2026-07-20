const { Schema, model } = require('mongoose');

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    headRef: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    emoji: { type: String, default: '🏢' },
    color: { type: String, default: '#2E86AB' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('Department', departmentSchema);
