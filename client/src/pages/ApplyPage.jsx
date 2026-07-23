import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import Select from '../components/Select';

const MAX_RESUME_BYTES = 4 * 1024 * 1024;

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  department: '',
  gender: '',
  experienceYears: '',
  permanentAddress: '',
  currentAddress: '',
};

export default function ApplyPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [sameAsPermanent, setSameAsPermanent] = useState(false);
  const [resume, setResume] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef(null);

  const { data: depts = [] } = useQuery({
    queryKey: ['departments-public'],
    queryFn: () => api.get('/departments/public').then((r) => r.data.items),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onFileSelected(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_RESUME_BYTES) {
      setErr('Resume file must be under 4MB.');
      return;
    }
    setErr('');
    setResume(f);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');

    if (!form.name || !form.email || !form.phone || !form.department || !form.gender || form.experienceYears === '') {
      setErr('Please fill in your name, email, mobile number, department, gender, and years of experience.');
      return;
    }
    if (!resume) {
      setErr('Please attach your resume.');
      return;
    }

    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.post('/job-applications', {
          ...form,
          currentAddress: sameAsPermanent ? form.permanentAddress : form.currentAddress,
          resumeUrl: reader.result,
          resumeName: resume.name,
        });
        setDone(true);
      } catch (ex) {
        setErr(ex.response?.data?.message || 'Could not submit your application. Please try again.');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(resume);
  }

  return (
    <div id="auth">
      <div className="al">
        <div className="al-icon"><img src="/images/ai-icon.png" alt="Applied Information" /></div>
        <div className="al-h">Careers at Applied<br />Information India</div>
        <div className="al-sub">We're always looking for great people. Tell us about yourself and we'll be in touch.</div>
      </div>
      <div className="ar">
        <div className="af" style={{ maxWidth: 480 }}>
          <div className="af-logo">
            <div className="af-logo-ic"><img src="/images/AI-horizontal-logo-R-gray-454x116-1.png" alt="Applied Information" /></div>
          </div>

          {done ? (
            <div>
              <div className="af-h">Application received</div>
              <div className="af-sub">Thanks, {form.name.split(' ')[0]}! Our hiring team will review your details and reach out if there's a fit.</div>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="af-h">Apply for a role</div>
              <div className="af-sub">Fill in your details below to submit your application.</div>
              <div className={`af-err${err ? ' show' : ''}`}><i className="fa-solid fa-circle-exclamation" /><span>{err}</span></div>

              <div className="fg2">
                <div className="fg">
                  <label className="fl">Full Name</label>
                  <input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="fg">
                  <label className="fl">Mobile Number</label>
                  <input className="fc" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="fg" style={{ gridColumn: '1 / -1' }}>
                  <label className="fl">Email Address</label>
                  <input className="fc" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
                </div>
                <div className="fg">
                  <label className="fl">Department</label>
                  <Select value={form.department} onChange={(e) => set('department', e.target.value)}>
                    <option value="">Select department</option>
                    {depts.filter((d) => d.name.toLowerCase() !== 'Head of Company').map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                  </Select>
                </div>
                <div className="fg">
                  <label className="fl">Gender</label>
                  <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
                <div className="fg" style={{ gridColumn: '1 / -1' }}>
                  <label className="fl">Total Years of Experience</label>
                  <input
                    className="fc"
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.experienceYears}
                    onChange={(e) => set('experienceYears', e.target.value)}
                    placeholder="e.g. 2"
                  />
                </div>
                <div className="fg" style={{ gridColumn: '1 / -1' }}>
                  <label className="fl">Permanent Address</label>
                  <textarea className="fc" style={{ height: 60, resize: 'none' }} value={form.permanentAddress} onChange={(e) => set('permanentAddress', e.target.value)} />
                </div>
                <div className="fg" style={{ gridColumn: '1 / -1' }}>
                  <label className="fl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Current Address
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', fontWeight: 500, cursor: 'pointer' }}>
                      <input type="checkbox" checked={sameAsPermanent} onChange={(e) => setSameAsPermanent(e.target.checked)} /> Same as permanent
                    </span>
                  </label>
                  {!sameAsPermanent && (
                    <textarea className="fc" style={{ height: 60, resize: 'none' }} value={form.currentAddress} onChange={(e) => set('currentAddress', e.target.value)} />
                  )}
                </div>
                <div className="fg" style={{ gridColumn: '1 / -1' }}>
                  <label className="fl">Resume (max 4MB)</label>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={onFileSelected} />
                  {resume ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '7px 10px' }}>
                      <i className="fa-solid fa-file" style={{ color: 'var(--t3)' }} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resume.name}</div>
                      <button className="btn bs bxs" type="button" onClick={() => fileInputRef.current?.click()}><i className="fa-solid fa-rotate" /> Replace</button>
                    </div>
                  ) : (
                    <button className="btn bs bsm" type="button" onClick={() => fileInputRef.current?.click()} style={{ width: '100%' }}>
                      <i className="fa-solid fa-upload" /> Choose File
                    </button>
                  )}
                </div>
              </div>

              <button className="af-btn" type="submit" disabled={busy} style={{ marginTop: 6 }}>
                {busy ? 'Submitting…' : 'Submit Application'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
