import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import ReferralFormModal from '../components/ReferralFormModal';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/avatar';

const STATUS_BADGE = { new: 'b-bl', reviewed: 'b-or', shortlisted: 'b-pu', hired: 'b-gr', rejected: 'b-re' };
const STATUS_LABEL = { new: 'In Review', reviewed: 'Reviewed', shortlisted: 'Shortlisted', rejected: 'Not Selected', hired: 'Hired' };

export default function MyReferralsPage() {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ['my-referrals'],
    queryFn: () => api.get('/job-applications/my-referrals').then((r) => r.data.items),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/job-applications/${id}/referral`),
    onSuccess: () => {
      toast('Referral withdrawn', 'warning');
      qc.invalidateQueries({ queryKey: ['my-referrals'] });
      setDeleting(null);
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not withdraw referral.', 'error'),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">My Referrals</div>
          <div className="pgs">{items.length} candidate(s) you've referred</div>
        </div>
      </div>
      {items.map((r) => (
        <div className="card mb13" key={r._id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t1)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                {r.name}
                <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--t2)', marginBottom: 4 }}>Referred for <strong>{r.department}</strong> · {formatDate(r.createdAt)}</div>
              {r.referrerComment && (
                <div style={{ fontSize: 11.5, color: 'var(--t2)', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 10px', marginTop: 6 }}>
                  <i className="fa-solid fa-comment" style={{ color: 'var(--t3)', marginRight: 5 }} />
                  {r.referrerComment}
                </div>
              )}
            </div>
            {r.status === 'new' && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn bs bxs bico" title="Edit referral" onClick={() => setEditing(r)}><i className="fa-solid fa-pen-to-square" /></button>
                <button className="btn brd bxs bico" title="Withdraw referral" onClick={() => setDeleting(r)}><i className="fa-solid fa-trash" /></button>
              </div>
            )}
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="card" style={{ color: 'var(--t3)', fontSize: 12 }}>
          You haven't referred anyone yet. Look for the "Refer a Candidate" button on your Dashboard.
        </div>
      )}
      {editing && <ReferralFormModal referral={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmModal
          title="Withdraw Referral"
          message={`Withdraw your referral for ${deleting.name}? This cannot be undone.`}
          confirmLabel="Withdraw"
          danger
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting._id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
