const { Schema, model } = require('mongoose');

const jobApplicationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    experienceYears: { type: Number, default: null, min: 0 },
    permanentAddress: { type: String, default: '', trim: true },
    currentAddress: { type: String, default: '', trim: true },
    resumeUrl: { type: String, required: true }, // base64 data URL
    resumeName: { type: String, default: '' },
    // 'careers_page' = candidate applied directly via the public /apply form.
    // 'referral' = an employee referred this candidate; referrerRef identifies who.
    source: { type: String, enum: ['careers_page', 'referral'], default: 'careers_page' },
    referrerRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['new', 'reviewed', 'shortlisted', 'rejected', 'hired'], default: 'new' },
    notes: { type: String, default: '' }, // internal HR notes — never shown to the referrer
    referrerComment: { type: String, default: '' }, // HR feedback shown to the referring employee

    // Marks records created by the demo/dummy-data seed script — lets a superadmin
    // wipe sample data cleanly before go-live without touching real applicants.
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('JobApplication', jobApplicationSchema);
