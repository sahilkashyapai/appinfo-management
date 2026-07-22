import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ADMIN_ROLES } from '../utils/roles';
import { subscribeToPush, unsubscribeFromPush } from '../utils/push';

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="trow">
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{hint}</div>}
      </div>
      <label className="tgl">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className="tgl-t" />
        <div className="tgl-d" />
      </label>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then((r) => r.data.settings) });
  const [smtpForm, setSmtpForm] = useState(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['settings'] });

  const putNotifications = useMutation({ mutationFn: (body) => api.put('/settings/notifications', body), onSuccess: invalidate });
  const putIntegrations = useMutation({ mutationFn: (body) => api.put('/settings/integrations', body), onSuccess: invalidate });
  const putSecurity = useMutation({ mutationFn: (body) => api.put('/settings/security', body), onSuccess: invalidate });
  const putTimeTracking = useMutation({ mutationFn: (body) => api.put('/settings/timeTracking', body), onSuccess: invalidate });
  const putSmtp = useMutation({
    mutationFn: (body) => api.put('/settings/smtp', body),
    onSuccess: () => {
      toast('Email configuration saved ✓', 'success');
      invalidate();
    },
  });
  const testEmail = useMutation({
    mutationFn: () => api.post('/settings/test-email'),
    onSuccess: (res) => toast(res.data.message, 'info'),
    onError: (err) => toast(err.response?.data?.message || 'Could not send test email.', 'error'),
  });

  if (!data) return null;
  const smtp = smtpForm || data.smtp;

  const notificationsCard = (
    <div className={`card${isAdmin ? ' mb13' : ''}`}>
      <div className="chd"><div className="cht"><i className="fa-solid fa-bell" /> Notification Channels</div></div>
      <ToggleRow label="Birthday Notifications" hint="Auto-send on employee birthdays" checked={data.notifications.birthday} onChange={(v) => putNotifications.mutate({ birthday: v })} />
      <ToggleRow label="Anniversary Notifications" hint="Auto-send on work anniversaries" checked={data.notifications.anniversary} onChange={(v) => putNotifications.mutate({ anniversary: v })} />
      <ToggleRow label="Event Reminders (D-7)" hint="7 days before event" checked={data.notifications.eventReminder7} onChange={(v) => putNotifications.mutate({ eventReminder7: v })} />
      <ToggleRow label="Event Reminders (D-1)" hint="1 day before event" checked={data.notifications.eventReminder1} onChange={(v) => putNotifications.mutate({ eventReminder1: v })} />
      <ToggleRow label="Email Delivery" hint="Send via SMTP" checked={data.notifications.emailDelivery} onChange={(v) => putNotifications.mutate({ emailDelivery: v })} />
      <ToggleRow
        label="Browser Push"
        hint="Get notified even when this tab isn't open"
        checked={data.notifications.browserPush}
        onChange={async (v) => {
          try {
            if (v) await subscribeToPush(api);
            else await unsubscribeFromPush(api);
            putNotifications.mutate({ browserPush: v });
          } catch (err) {
            toast(err.message === 'Permission denied' ? 'Browser notification permission was denied.' : err.message || 'Could not enable push notifications.', 'error');
          }
        }}
      />
    </div>
  );

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">{isAdmin ? 'System Settings' : 'Settings'}</div>
          <div className="pgs">{isAdmin ? 'Configure notifications, security, and integrations' : 'Notification preferences'}</div>
        </div>
      </div>
      {isAdmin ? (
        <div className="g2">
          <div>
            {notificationsCard}
            <div className="card">
              <div className="chd"><div className="cht"><i className="fa-solid fa-plug" /> Integrations</div></div>
              <ToggleRow label="Microsoft Teams" hint="Webhook integration" checked={data.integrations.teams} onChange={(v) => putIntegrations.mutate({ teams: v })} />
              <ToggleRow label="Slack" hint="Incoming webhook" checked={data.integrations.slack} onChange={(v) => putIntegrations.mutate({ slack: v })} />
              <ToggleRow label="WhatsApp Business" hint="API notifications" checked={data.integrations.whatsapp} onChange={(v) => putIntegrations.mutate({ whatsapp: v })} />
            </div>
          </div>
          <div>
            <div className="card mb13">
              <div className="chd"><div className="cht"><i className="fa-solid fa-envelope" /> Email Configuration (SMTP)</div></div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
                Real SMTP credentials (host/user/password) live in <code>server/.env</code> and are never exposed here. These fields only control the display name/address used in outgoing emails.
              </div>
              <div className="fg2">
                <div className="fg"><label className="fl">SMTP Host</label><input className="fc" value={smtp.host} onChange={(e) => setSmtpForm({ ...smtp, host: e.target.value })} /></div>
                <div className="fg"><label className="fl">SMTP Port</label><input className="fc" value={smtp.port} onChange={(e) => setSmtpForm({ ...smtp, port: Number(e.target.value) })} /></div>
                <div className="fg"><label className="fl">From Email</label><input className="fc" value={smtp.fromEmail} onChange={(e) => setSmtpForm({ ...smtp, fromEmail: e.target.value })} /></div>
                <div className="fg"><label className="fl">From Name</label><input className="fc" value={smtp.fromName} onChange={(e) => setSmtpForm({ ...smtp, fromName: e.target.value })} /></div>
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button className="btn bp bsm" onClick={() => putSmtp.mutate(smtp)} disabled={putSmtp.isPending}><i className="fa-solid fa-check" /> Save</button>
                <button className="btn bs bsm" onClick={() => testEmail.mutate()} disabled={testEmail.isPending}><i className="fa-solid fa-paper-plane" /> Send Test Email</button>
              </div>
            </div>
            <div className="card">
              <div className="chd"><div className="cht"><i className="fa-solid fa-shield" /> Security Policies</div></div>
              <ToggleRow label="Account Lockout (5 attempts)" hint="30-minute lockout" checked={data.security.accountLockout} onChange={(v) => putSecurity.mutate({ accountLockout: v })} />
              <ToggleRow label="Two-Factor Auth (TOTP)" hint="Enable from your Profile page" checked={data.security.twoFactor} onChange={(v) => putSecurity.mutate({ twoFactor: v })} />
              <div className="trow">
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>Session Timeout</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>Auto-logout when idle (minutes)</div>
                </div>
                <input
                  type="number"
                  className="fc"
                  style={{ width: 70 }}
                  defaultValue={data.security.sessionTimeoutMins}
                  onBlur={(e) => putSecurity.mutate({ sessionTimeoutMins: Number(e.target.value) })}
                />
              </div>
              <ToggleRow label="Audit Logging" hint="Log all data changes" checked={data.security.auditLogging} onChange={(v) => putSecurity.mutate({ auditLogging: v })} />
              <ToggleRow label="CSRF Protection" hint="Informational — auth uses Bearer JWT, not cookies" checked={data.security.csrfProtection} onChange={(v) => putSecurity.mutate({ csrfProtection: v })} />
              <ToggleRow label="Employee Time Tracking" hint="Log start time + IP address on every login" checked={data.timeTracking.enabled} onChange={(v) => putTimeTracking.mutate({ enabled: v })} />
            </div>
          </div>
        </div>
      ) : (
        notificationsCard
      )}
    </div>
  );
}
