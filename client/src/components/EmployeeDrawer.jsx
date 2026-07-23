import { useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import Avatar from './Avatar';
import ConfirmModal from './ConfirmModal';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { formatDate, daysUntilNext } from '../utils/avatar';
import { ADMIN_ROLES } from '../utils/roles';
import { STATUS_LABEL, STATUS_BADGE } from '../utils/attendance';

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const ASSET_STATUS_BADGE = { unassigned: 'b-gy', assigned: 'b-bl', returned: 'b-gy', damaged: 'b-re', lost: 'b-re' };

const MILESTONE_STYLE = {
  1: ['fa-solid fa-medal', '1 Year', '#FEF9C3', '#854D0E'],
  3: ['fa-solid fa-star', '3 Years', '#D1FAE5', '#065F46'],
  5: ['fa-solid fa-gem', '5 Years', '#EDE9FE', '#5B21B6'],
  7: ['fa-solid fa-rocket', '7 Years', '#DBEAFE', '#1D4ED8'],
  10: ['fa-solid fa-trophy', '10 Years', '#FEE2E2', '#991B1B'],
};

export default function EmployeeDrawer({ onEdit }) {
  const { employeeId, closeEmployee } = useDrawers();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
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
    mutationFn: () => {
      const bday = daysUntilNext(data.employee.dob) === 0;
      const text = bday
        ? `Happy Birthday, ${data.employee.name}! Wishing you a fantastic year ahead!`
        : `Congratulations ${data.employee.name} on your work anniversary! 🎉`;
      return api.post('/wall', { text, tag: bday ? 'birthday' : 'anniversary' });
    },
    onSuccess: () => {
      toast(`Wish posted for ${data.employee.name}!`, 'birthday');
      qc.invalidateQueries({ queryKey: ['wall'] });
    },
  });

  const startChat = useMutation({
    mutationFn: () => api.post('/chat/conversations', { memberIds: [data.employee.userRef._id], isGroup: false }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      closeEmployee();
      navigate('/messages', { state: { conversationId: res.data.conversation._id } });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not start chat.', 'error'),
  });

  const docFileInputRef = useRef(null);
  const uploadDoc = useMutation({
    mutationFn: (body) => api.post('/documents', body),
    onSuccess: () => {
      toast('Document uploaded ✓', 'success');
      qc.invalidateQueries({ queryKey: ['employee', employeeId] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not upload document.', 'error'),
  });

  function onDocFileSelected(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast(`${file.name} is over 4MB.`, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      uploadDoc.mutate({ employeeRef: employeeId, name: file.name, fileName: file.name, fileType: file.type, fileUrl: reader.result });
    reader.readAsDataURL(file);
  }

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

  if (!employeeId || !data) return <div id="epd" />;

  const { employee: e, years, milestones, stats } = data;
  const canWishToday = daysUntilNext(e.dob) === 0 || (years >= 1 && daysUntilNext(e.joined) === 0);
  const canChat = e.userRef && e.userRef._id !== user?.id;
  const isOwnRecord = e.userRef?._id === user?.id;
  const canManageAssets = ADMIN_ROLES.includes(user?.role);
  const canSeeDocsAssets = canManageAssets || isOwnRecord;

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
              <span className="badge b-pu">{e.roleLabel || 'Engineer / Developer'}</span>
              {todayStatuses[e._id] ? (
                <span className={`badge ${STATUS_BADGE[todayStatuses[e._id]]}`}>{STATUS_LABEL[todayStatuses[e._id]]} today</span>
              ) : (
                <span className="badge b-gy">Not marked today</span>
              )}
            </div>
          </div>
          <span className={`badge ${e.status === 'active' ? 'b-gr' : 'b-re'}`} style={{ textTransform: 'capitalize' }}>{e.status}</span>
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
          ['Account Role', e.userRef?.role ? e.userRef.role.charAt(0).toUpperCase() + e.userRef.role.slice(1) : '—'],
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
      {canSeeDocsAssets && (
        <div className="ep-sec">
          <div className="ep-sec-t" style={{ display: 'flex', alignItems: 'center' }}>
            Documents
            {canManageAssets && (
              <button className="btn bs bxs bico" style={{ marginLeft: 'auto' }} onClick={() => docFileInputRef.current?.click()} disabled={uploadDoc.isPending}>
                <i className="fa-solid fa-upload" />
              </button>
            )}
          </div>
          <input ref={docFileInputRef} type="file" hidden onChange={onDocFileSelected} />
          {(data.documents || []).map((d) => (
            <div className="ep-row" key={d._id}>
              <div className="ep-lbl"><i className="fa-solid fa-file" /> {d.name}</div>
              <div className="ep-val"><a href={d.fileUrl} download={d.fileName || d.name}>Download</a></div>
            </div>
          ))}
          {(data.documents || []).length === 0 && <span style={{ fontSize: 12, color: 'var(--t3)' }}>No documents uploaded</span>}
        </div>
      )}
      {canSeeDocsAssets && (
        <div className="ep-sec">
          <div className="ep-sec-t">Assets</div>
          {(data.assets || []).map((a) => (
            <div className="ep-row" key={a._id}>
              <div className="ep-lbl">{a.name} <span style={{ color: 'var(--t3)' }}>({a.category})</span></div>
              <div className="ep-val"><span className={`badge ${ASSET_STATUS_BADGE[a.status]}`} style={{ textTransform: 'capitalize' }}>{a.status}</span></div>
            </div>
          ))}
          {(data.assets || []).length === 0 && <span style={{ fontSize: 12, color: 'var(--t3)' }}>No assets assigned</span>}
        </div>
      )}
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
          {canWishToday && (
            <button className="btn bp bsm" onClick={() => sendWish.mutate()} disabled={sendWish.isPending}>
              <i className="fa-solid fa-paper-plane" /> Send Wish
            </button>
          )}
          {!canWishToday && canChat && (
            <button className="btn bp bsm" onClick={() => startChat.mutate()} disabled={startChat.isPending}>
              <i className="fa-solid fa-comment-dots" /> Chat
            </button>
          )}
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
            <button className="btn bor bsm" onClick={() => setConfirmingDelete(true)} disabled={deleteEmployee.isPending} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
              <i className="fa-solid fa-trash" /> Delete Permanently
            </button>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmModal
          title="Delete Employee"
          message={`Permanently delete ${e.name}? This removes their employee record and login account from the database and cannot be undone.`}
          confirmLabel="Delete Permanently"
          danger
          pending={deleteEmployee.isPending}
          onConfirm={() => {
            setConfirmingDelete(false);
            deleteEmployee.mutate();
          }}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
