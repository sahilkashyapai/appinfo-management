import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import AnnouncementFormModal from '../components/AnnouncementFormModal';
import { formatDate } from '../utils/avatar';

const PRIORITY_BADGE = { high: 'b-re', medium: 'b-or', low: 'b-gr' };

export default function AnnouncementsPage() {
  const [formState, setFormState] = useState(undefined); // undefined=closed, { type }=create, { announcement }=edit
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = ['superadmin', 'hr'].includes(user?.role);

  const { data: items = [] } = useQuery({ queryKey: ['announcements'], queryFn: () => api.get('/announcements').then((r) => r.data.items) });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      toast('Deleted', 'warning');
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Announcements</div>
          <div className="pgs">{items.length} active · {items.filter((a) => a.pinned).length} pinned</div>
        </div>
        {canManage && (
          <div className="ph-r" style={{ display: 'flex', gap: 7 }}>
            <button className="btn bs bsm" onClick={() => setFormState({ type: 'hiring' })}><i className="fa-solid fa-briefcase" /> New Hiring Alert</button>
            <button className="btn bp bsm" onClick={() => setFormState({ type: 'general' })}><i className="fa-solid fa-plus" /> New Announcement</button>
          </div>
        )}
      </div>
      {items.map((a) => (
        <div className={`ann ${a.priority}`} key={a._id}>
          <div style={{ fontSize: 21, flexShrink: 0, marginTop: 1 }}>{a.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--t1)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {a.pinned ? '📌 ' : ''}{a.title}
              <span className={`badge ${PRIORITY_BADGE[a.priority]}`} style={{ textTransform: 'capitalize' }}>{a.priority}</span>
              {a.type === 'hiring' && <span className="badge b-gr"><i className="fa-solid fa-briefcase" /> Hiring</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 5 }}>{a.body}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)' }}>Posted by <strong>{a.postedByRef?.name || 'Unknown'}</strong> · {formatDate(a.createdAt)}</div>
          </div>
          {canManage && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, marginLeft: 8 }}>
              <button className="btn bs bxs bico" onClick={() => setFormState({ announcement: a })}><i className="fa-solid fa-pen-to-square" /></button>
              <button className="btn brd bxs bico" onClick={() => remove.mutate(a._id)}><i className="fa-solid fa-trash" /></button>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12 }}>No announcements yet.</div>}
      {formState !== undefined && (
        <AnnouncementFormModal announcement={formState.announcement} defaultType={formState.type} onClose={() => setFormState(undefined)} />
      )}
    </div>
  );
}
