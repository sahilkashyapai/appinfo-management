import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from './Avatar';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/avatar';
import { ADMIN_ROLES } from '../utils/roles';
import { STATUS_LABEL, STATUS_BADGE } from '../utils/attendance';

const MILESTONE_STYLE = {
  1: ['fa-solid fa-medal', '1 Year', '#FEF9C3', '#854D0E'],
  3: ['fa-solid fa-star', '3 Years', '#D1FAE5', '#065F46'],
  5: ['fa-solid fa-gem', '5 Years', '#EDE9FE', '#5B21B6'],
  7: ['fa-solid fa-rocket', '7 Years', '#DBEAFE', '#1D4ED8'],
  10: ['fa-solid fa-trophy', '10 Years', '#FEE2E2', '#991B1B'],
};

export default function EmployeeDrawer({ onEdit }) {
  const { employeeId, closeEmployee } = useDrawers();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = ['superadmin', 'hr'].includes(user?.role);
  const canSeePhone = ADMIN_ROLES.includes(user?.role);
  const canDelete = user?.role === 'superadmin';

  const { data } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const { data: todayStatuses = {} } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get('/attendance/today').then((r) => r.data.statuses),
  });

  const sendWish = useMutation({
    mutationFn: () =>
      api.post('/wall', { text: `Happy Birthday, ${data.employee.name}! Wishing you a fantastic year ahead!`, tag: 'birthday' }),
    onSuccess: () => {
      toast(`Birthday wish posted for ${data.employee.name}!`, 'birthday');
      qc.invalidateQueries({ queryKey: ['wall'] });
    },
  });

  const deactivate = useMutation({
    mutationFn: () => api.patch(`/employees/${employeeId}/status`, { status: 'inactive' }),
    onSuccess: () => {
      toast(`${data.employee.name} deactivated`, 'warning');
      qc.invalidateQueries({ queryKey: ['employee', employeeId] });
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: () => api.delete(`/employees/${employeeId}`),
    onSuccess: () => {
      toast(`${data.employee.name} permanently deleted`, 'warning');
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employees-summary'] });
      closeEmployee();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not delete employee.', 'error'),
  });

  function confirmDelete() {
    if (window.confirm(`Permanently delete ${data.employee.name}? This removes their employee record and login account from the database and cannot be undone.`)) {
      deleteEmployee.mutate();
    }
  }

  if (!employeeId || !data) return <div id="epd" />;

  const { employee: e, years, milestones, stats } = data;

  return (
    <div id="epd" className="open">
      <div className="ep-banner">
        <div className="ep-banner-logo"><img src="/images/AI-horizontal-logo-R-gray-454x116-1.png" alt="Applied Information" /></div>
        <button className="ep-close" onClick={closeEmployee}>
          <i className="fa-solid fa-xmark" />
        </button>
        <div className="ep-av-pos">
          <Avatar name={e.name} index={e.avatarIndex} src={e.userRef?.avatarUrl} size={56} fontSize={19} style={{ border: '3px solid var(--bg2)' }} />
        </div>
      </div>
      <div className="ep-info">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 5 }}>
          <div>
            <div className="ep-name">{e.name}</div>
            <div className="ep-role">{e.desig} · {e.dept}</div>
            <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
              <span className="badge b-pu">{e.roleLabel || 'Employee'}</span>
              {todayStatuses[e._id] ? (
                <span className={`badge ${STATUS_BADGE[todayStatuses[e._id]]}`}>{STATUS_LABEL[todayStatuses[e._id]]} today</span>
              ) : (
                <span className="badge b-gy">Not marked today</span>
              )}
            </div>
          </div>
          <span className={`badge ${e.status === 'active' ? 'b-gr' : 'b-re'}`}>{e.status}</span>
        </div>
        <div className="ep-stats">
          <div className="ep-stat"><div className="sv">{years}</div><div className="sl">Years</div></div>
          <div className="ep-stat"><div className="sv">{stats.wishesReceived}</div><div className="sl">Wishes</div></div>
          <div className="ep-stat"><div className="sv">{stats.postsCount}</div><div className="sl">Posts</div></div>
          <div className="ep-stat"><div className="sv">{stats.eventsRsvpCount}</div><div className="sl">Events</div></div>
        </div>
      </div>
      <div className="ep-sec">
        <div className="ep-sec-t">Personal Information</div>
        {[
          ['Employee ID', e.empId],
          ['Email', e.email],
          ['Account Role', e.userRef?.role || '—'],
          ...(canSeePhone ? [['Phone', e.phone || '—']] : []),
          ['Date of Birth', formatDate(e.dob)],
          ['Location', e.location],
        ].map(([l, v]) => (
          <div className="ep-row" key={l}><div className="ep-lbl">{l}</div><div className="ep-val">{v}</div></div>
        ))}
      </div>
      <div className="ep-sec">
        <div className="ep-sec-t">Work Information</div>
        {[['Department', e.dept], ['Designation', e.desig], ['Joined', formatDate(e.joined)], ['Manager', e.managerRef?.name || '—'], ['Status', e.status]].map(([l, v]) => (
          <div className="ep-row" key={l}><div className="ep-lbl">{l}</div><div className="ep-val" style={{ textTransform: 'capitalize' }}>{v}</div></div>
        ))}
      </div>
      <div className="ep-sec">
        <div className="ep-sec-t">Milestone Badges</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 4 }}>
          {milestones.length === 0 && <span style={{ fontSize: 12, color: 'var(--t3)' }}>No milestones yet</span>}
          {milestones.map((y) => {
            const [icon, label, bg, c] = MILESTONE_STYLE[y];
            return (
              <span key={y} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color: c }}>
                <i className={icon} /> {label}
              </span>
            );
          })}
        </div>
      </div>
      <div className="ep-sec">
        <div className="ep-sec-t">Quick Actions</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <button className="btn bp bsm" onClick={() => sendWish.mutate()} disabled={sendWish.isPending}>
            <i className="fa-solid fa-paper-plane" /> Send Wish
          </button>
          {canManage && (
            <button className="btn bs bsm" onClick={() => onEdit?.(e)}>
              <i className="fa-solid fa-pen-to-square" /> Edit
            </button>
          )}
          {canManage && e.status === 'active' && (
            <button className="btn bor bsm" onClick={() => deactivate.mutate()} disabled={deactivate.isPending}>
              <i className="fa-solid fa-user-slash" /> Deactivate
            </button>
          )}
          {canDelete && (
            <button className="btn bor bsm" onClick={confirmDelete} disabled={deleteEmployee.isPending} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
              <i className="fa-solid fa-trash" /> Delete Permanently
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
