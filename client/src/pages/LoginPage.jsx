import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';

export default function LoginPage() {
  const { user, login, verify2fa, pending2fa } = useAuth();
  const [email, setEmail] = useState('superadmin@aii.in');
  const [password, setPassword] = useState('Admin@123');
  const [showPwd, setShowPwd] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!email || !password) {
      setErr('Please enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify2fa(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await verify2fa(code);
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    try {
      await api.post('/auth/forgot-password', { email });
      toast('If that email exists, a password reset link has been sent.', 'info');
    } catch {
      toast('Could not send reset email.', 'error');
    }
  }

  return (
    <div id="auth">
      <div className="al">
        <div className="al-icon"><i className="fa-solid fa-champagne-glasses" /></div>
        <div className="al-h">Employee Celebrations<br />&amp; Events Platform</div>
        <div className="al-sub">Applied Information India's unified hub for birthdays, anniversaries, events, and team recognition.</div>
        <div className="al-feat">
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-cake-candles" /></div>Automated birthday &amp; anniversary notifications</div>
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-calendar-days" /></div>End-to-end event management with RSVP</div>
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-heart" /></div>Celebration Wall with reactions &amp; comments</div>
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-chart-column" /></div>Real-time analytics &amp; engagement reports</div>
          <div className="al-fi"><div className="al-fic"><i className="fa-solid fa-shield-halved" /></div>Enterprise security — RBAC, JWT, audit logs</div>
        </div>
      </div>
      <div className="ar">
        <div className="af">
          <div className="af-logo">
            <img src="/images/AI-horizontal-logo-R-gray-454x116-1.png" alt="Applied Information" />
          </div>

          {!pending2fa ? (
            <form onSubmit={onSubmit}>
              <div className="af-h">Welcome back</div>
              <div className="af-sub">Sign in to your account to continue</div>
              <div className={`af-err${err ? ' show' : ''}`}><i className="fa-solid fa-circle-exclamation" /><span>{err}</span></div>
              <div className="af-g">
                <label className="af-lbl">Email Address</label>
                <input className="af-inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@appliedinformation.in" />
              </div>
              <div className="af-g">
                <label className="af-lbl">Password</label>
                <div className="pw-wrap">
                  <input className="af-inp" type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                  <button type="button" className="pw-btn" onClick={() => setShowPwd((s) => !s)}>
                    <i className={`fa-solid ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--accent)' }} /> Remember me
                </label>
                <a style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }} onClick={onForgot}>Forgot password?</a>
              </div>
              <button className="af-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
              <div className="af-hint">New employee? <Link to="/signup" style={{ color: 'var(--accent)', fontWeight: 700 }}>Create an account</Link></div>
              <div className="af-hint">Demo credentials: <strong>superadmin@aii.in</strong> / <strong>Admin@123</strong></div>
            </form>
          ) : (
            <form onSubmit={onVerify2fa}>
              <div className="af-h">Two-factor verification</div>
              <div className="af-sub">Enter the 6-digit code from your authenticator app</div>
              <div className={`af-err${err ? ' show' : ''}`}><i className="fa-solid fa-circle-exclamation" /><span>{err}</span></div>
              <div className="af-g">
                <label className="af-lbl">Authentication Code</label>
                <input className="af-inp" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} autoFocus />
              </div>
              <button className="af-btn" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify & Sign In'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
