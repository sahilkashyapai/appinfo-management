const { Schema, model } = require('mongoose');

const holidaySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ['National', 'Festival', 'Optional'], default: 'National' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('Holiday', holidaySchema);
