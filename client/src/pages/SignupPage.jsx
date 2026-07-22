import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const EMP_ID_REGEX = /^APIIND\d{6}$/;

const EMPTY_FORM = {
  name: '',
  email: '',
  empId: '',
  phone: '',
  dob: '',
  joined: '',
  department: '',
  password: '',
  confirmPassword: '',
};

export default function SignupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const { data: depts = [] } = useQuery({
    queryKey: ['departments-public'],
    queryFn: () => api.get('/departments/public').then((r) => r.data.items),
  });

  if (user) return <Navigate to="/" replace />;

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');

    if (Object.entries(form).some(([k, v]) => k !== 'confirmPassword' && !v)) {
      setErr('Please fill in every field.');
      return;
    }
    if (!EMP_ID_REGEX.test(form.empId)) {
      setErr('Employee ID must look like APIIND000000 — check the ID given to you by HR.');
      return;
    }
    if (form.password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { confirmPassword, ...payload } = form;
      await api.post('/auth/register', payload);
      setDone(true);
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Could not submit registration.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="auth">
      <div className="al">
        <div className="al-icon"><i className="fa-solid fa-champagne-glasses" /></div>
        <div className="al-h">Employee Celebrations<br />&amp; Events Platform</div>
        <div className="al-sub">Create your employee account to see birthdays, anniversaries, events, and announcements from Applied Information India.</div>
        <div className="al-feat">
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-cake-candles" /></div>See today's birthdays &amp; anniversaries</div>
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-calendar-days" /></div>RSVP to company events</div>
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-heart" /></div>Post on the Celebration Wall</div>
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-bullhorn" /></div>Stay on top of announcements</div>
        </div>
      </div>
      <div className="ar" style={{ alignItems: 'flex-start' }}>
        <div className="af" style={{ maxWidth: 460 }}>
          <div className="af-logo">
            <div className="af-logo-ic"><i className="fa-solid fa-champagne-glasses" /></div>
            <div className="af-logo-t">Applied Information India</div>
          </div>

          {done ? (
            <div>
              <div className="af-h">Registration submitted</div>
              <div className="af-sub">
                Thanks, {form.name.split(' ')[0]}! An admin will review your details and activate your account. You'll get an email once it's approved.
              </div>
              <button className="af-btn" onClick={() => navigate('/login')}>Back to Sign In</button>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="af-h">Create your account</div>
              <div className="af-sub">Employee sign-up — an admin reviews every new account before it's activated.</div>
              <div className={`af-err${err ? ' show' : ''}`}><i className="fa-solid fa-circle-exclamation" /><span>{err}</span></div>

              <div className="fg2">
                <div className="fg">
                  <label className="fl">Full Name</label>
                  <input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="fg">
                  <label className="fl">Employee ID</label>
                  <input className="fc" value={form.empId} onChange={(e) => set('empId', e.target.value.toUpperCase())} placeholder="APIIND000000" maxLength={12} />
                </div>
                <div className="fg" style={{ gridColumn: '1 / -1' }}>
                  <label className="fl">Official Email</label>
                  <input className="fc" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@appinfoinc.com" />
                </div>
                <div className="fg">
                  <label className="fl">Mobile Number</label>
                  <input className="fc" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="fg">
                  <label className="fl">Department</label>
                  <select className="fc" value={form.department} onChange={(e) => set('department', e.target.value)}>
                    <option value="">Select…</option>
                    {depts.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Date of Birth</label>
                  <input className="fc" type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl">Date of Joining</label>
                  <input className="fc" type="date" value={form.joined} onChange={(e) => set('joined', e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl">Password</label>
                  <div className="pw-wrap">
                    <input className="fc" type={showPwd ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min. 8 characters" />
                    <button type="button" className="pw-btn" onClick={() => setShowPwd((s) => !s)}>
                      <i className={`fa-solid ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Confirm Password</label>
                  <input className="fc" type={showPwd ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Re-enter password" />
                </div>
              </div>

              <button className="af-btn" type="submit" disabled={busy} style={{ marginTop: 6 }}>
                {busy ? 'Submitting…' : 'Create Account'}
              </button>
              <div className="af-hint">Already have an account? <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 700 }}>Sign in</Link></div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
