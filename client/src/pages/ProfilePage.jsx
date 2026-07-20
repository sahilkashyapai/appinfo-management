import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils/avatar';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const ACTION_ICON = {
  LOGIN: 'fa-solid fa-right-to-bracket',
  LOGIN_FAILED: 'fa-solid fa-triangle-exclamation',
  CREATE: 'fa-solid fa-plus',
  UPDATE: 'fa-solid fa-pen-to-square',
  DELETE: 'fa-solid fa-trash',
  EXPORT: 'fa-solid fa-download',
};

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const photoInputRef = useRef(null);

  const { data } = useQuery({ queryKey: ['profile'], queryFn: () => api.get('/profile').then((r) => r.data) });

  const [form, setForm] = useState(null);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [twofa, setTwofa] = useState(null); // { secret, qrDataUrl }
  const [code, setCode] = useState('');

  const profile = form || (data ? { name: user.name, email: user.email, phone: user.phone, department: user.department, location: user.location, branch: user.branch } : null);

  const saveProfile = useMutation({
    mutationFn: () => api.put('/profile', profile),
    onSuccess: async () => {
      toast('Profile updated', 'success');
      await refreshUser();
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const savePhoto = useMutation({
    mutationFn: (avatarUrl) => api.put('/profile', { avatarUrl }),
    onSuccess: async () => {
      toast('Profile photo updated', 'success');
      await refreshUser();
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update photo.', 'error'),
  });

  function onPhotoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file.', 'error');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast('Image must be under 2 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => savePhoto.mutate(reader.result);
    reader.readAsDataURL(file);
  }

  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword }),
    onSuccess: () => {
      toast('Password changed. Please sign in again.', 'success');
      setTimeout(logout, 1000);
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not change password.', 'error'),
  });

  const setup2fa = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup'),
    onSuccess: (res) => setTwofa(res.data),
  });
  const enable2fa = useMutation({
    mutationFn: () => api.post('/auth/2fa/enable', { code }),
    onSuccess: async () => {
      toast('Two-factor authentication enabled.', 'success');
      setTwofa(null);
      setCode('');
      await refreshUser();
    },
    onError: (err) => toast(err.response?.data?.message || 'Incorrect code.', 'error'),
  });
  const disable2fa = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable'),
    onSuccess: async () => {
      toast('Two-factor authentication disabled.', 'info');
      await refreshUser();
    },
  });

  if (!data) return null;

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">My Profile</div>
          <div className="pgs">Manage your account, preferences, and security</div>
        </div>
      </div>
      <div className="g2">
        <div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--rl)', overflow: 'hidden', marginBottom: 13, boxShadow: 'var(--sh)' }}>
            <div className="prof-banner">
              <div className="prof-banner-logo"><img src="/images/AI-horizontal-logo-R-gray-454x116-1.png" alt="Applied Information" /></div>
              <div className="prof-av-pos">
                <Avatar name={user.name} index={user.avatarIndex} src={user.avatarUrl} size={58} fontSize={20} style={{ border: '3px solid var(--bg2)' }} />
                <button
                  type="button"
                  className="btn bs bico"
                  disabled={savePhoto.isPending}
                  onClick={() => photoInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, fontSize: 10, borderRadius: '50%' }}
                  title="Change profile photo"
                >
                  <i className="fa-solid fa-camera" />
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={onPhotoSelected} />
              </div>
            </div>
            <div style={{ padding: '34px 20px 18px' }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--t1)' }}>{user.name}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{user.email} · {user.department || '—'}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                <span className="badge b-bl" style={{ textTransform: 'capitalize' }}>{user.role}</span>
                <span className="badge b-gr">Active</span>
                {user.totpEnabled && <span className="badge b-pu">2FA On</span>}
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--bd)' }}>
                <div><div style={{ fontSize: 16, fontWeight: 900, color: 'var(--t1)' }}>{data.platformStats.employees}</div><div style={{ fontSize: 10, color: 'var(--t3)' }}>Employees</div></div>
                <div><div style={{ fontSize: 16, fontWeight: 900, color: 'var(--t1)' }}>{data.platformStats.events}</div><div style={{ fontSize: 10, color: 'var(--t3)' }}>Events</div></div>
                <div><div style={{ fontSize: 16, fontWeight: 900, color: 'var(--t1)' }}>{data.platformStats.notifications}</div><div style={{ fontSize: 10, color: 'var(--t3)' }}>Notifications</div></div>
                <div><div style={{ fontSize: 16, fontWeight: 900, color: 'var(--t1)' }}>{data.platformStats.wallPosts}</div><div style={{ fontSize: 10, color: 'var(--t3)' }}>Wall Posts</div></div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="chd"><div className="cht"><i className="fa-solid fa-chart-line" /> Recent Activity</div></div>
            {data.activity.map((a) => (
              <div className="tl-item" key={a._id}>
                <div className="tl-dot" style={{ background: 'var(--bg3)' }}><i className={ACTION_ICON[a.action] || 'fa-solid fa-file-pen'} /></div>
                <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 8, padding: '8px 11px', border: '1px solid var(--bd)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{a.detail}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}><i className="fa-solid fa-clock" style={{ fontSize: 10 }} /> {formatDateTime(a.createdAt)}</div>
                </div>
              </div>
            ))}
            {data.activity.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>No recent activity.</div>}
          </div>
        </div>
        <div>
          <div className="card mb13">
            <div className="chd"><div className="cht"><i className="fa-solid fa-user-pen" /> Edit Profile</div></div>
            <div className="fg2">
              <div className="fg"><label className="fl">Full Name</label><input className="fc" value={profile.name} onChange={(e) => setForm({ ...profile, name: e.target.value })} /></div>
              <div className="fg"><label className="fl">Email</label><input className="fc" value={profile.email} onChange={(e) => setForm({ ...profile, email: e.target.value })} /></div>
              <div className="fg"><label className="fl">Phone</label><input className="fc" value={profile.phone || ''} onChange={(e) => setForm({ ...profile, phone: e.target.value })} /></div>
              <div className="fg"><label className="fl">Department</label><input className="fc" value={profile.department || ''} onChange={(e) => setForm({ ...profile, department: e.target.value })} /></div>
              <div className="fg"><label className="fl">Location</label><input className="fc" value={profile.location || ''} onChange={(e) => setForm({ ...profile, location: e.target.value })} /></div>
              <div className="fg"><label className="fl">Branch</label><input className="fc" value={profile.branch || ''} onChange={(e) => setForm({ ...profile, branch: e.target.value })} /></div>
            </div>
            <button className="btn bp bsm" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}><i className="fa-solid fa-check" /> Save Changes</button>
          </div>

          <div className="card mb13">
            <div className="chd"><div className="cht"><i className="fa-solid fa-lock" /> Change Password</div></div>
            <div className="fg"><label className="fl">Current Password</label><input type="password" className="fc" placeholder="••••••••" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} /></div>
            <div className="fg"><label className="fl">New Password</label><input type="password" className="fc" placeholder="Min. 8 characters" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} /></div>
            <div className="fg"><label className="fl">Confirm New Password</label><input type="password" className="fc" placeholder="••••••••" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button
                className="btn brd bsm"
                disabled={!pwd.currentPassword || pwd.newPassword.length < 8 || pwd.newPassword !== pwd.confirm || changePassword.isPending}
                onClick={() => changePassword.mutate()}
              >
                <i className="fa-solid fa-key" /> Change Password
              </button>
              <button className="btn bs bsm" onClick={logout}><i className="fa-solid fa-right-from-bracket" /> Sign Out</button>
            </div>
          </div>

          <div className="card">
            <div className="chd"><div className="cht"><i className="fa-solid fa-shield" /> Two-Factor Authentication</div></div>
            {!user.totpEnabled && !twofa && (
              <>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 10 }}>Add an extra layer of security to your account using an authenticator app.</div>
                <button className="btn bp bsm" onClick={() => setup2fa.mutate()} disabled={setup2fa.isPending}><i className="fa-solid fa-qrcode" /> Set Up 2FA</button>
              </>
            )}
            {twofa && (
              <>
                <img src={twofa.qrDataUrl} alt="2FA QR code" style={{ width: 160, height: 160, marginBottom: 10 }} />
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>Scan with your authenticator app, then enter the 6-digit code to confirm.</div>
                <div className="fg"><input className="fc" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} /></div>
                <button className="btn bgn bsm" onClick={() => enable2fa.mutate()} disabled={enable2fa.isPending}><i className="fa-solid fa-check" /> Confirm & Enable</button>
              </>
            )}
            {user.totpEnabled && (
              <>
                <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 10 }}><i className="fa-solid fa-shield-halved" /> Two-factor authentication is enabled.</div>
                <button className="btn brd bsm" onClick={() => disable2fa.mutate()} disabled={disable2fa.isPending}><i className="fa-solid fa-circle-xmark" /> Disable 2FA</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
