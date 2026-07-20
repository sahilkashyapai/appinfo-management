import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import Badge from '../components/Badge';
import { formatDate } from '../utils/avatar';

const STATUS_COLOR = { pending: 'orange', approved: 'green', rejected: 'red' };

function ApproveModal({ registration, onClose }) {
  const [desig, setDesig] = useState('');
  const [location, setLocation] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const approve = useMutation({
    mutationFn: () => api.post(`/registrations/${registration._id}/approve`, { desig, location }),
    onSuccess: () => {
      toast(`${registration.name}'s account is now active ✓`, 'success');
      qc.invalidateQueries({ queryKey: ['registrations'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not approve registration.', 'error'),
  });

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-check" /> Approve {registration.name}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 12 }}>
          This creates an Employee record for {registration.name} ({registration.empId}) and activates their login.
        </div>
        <div className="fg"><label className="fl">Designation</label><input className="fc" value={desig} onChange={(e) => setDesig(e.target.value)} placeholder="e.g. Software Engineer" autoFocus /></div>
        <div className="fg"><label className="fl">Location (optional)</label><input className="fc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bengaluru" /></div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bgn bsm" disabled={approve.isPending || !desig} onClick={() => approve.mutate()}>
            <i className="fa-solid fa-check" /> Approve &amp; Activate
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ registration, onClose }) {
  const [reason, setReason] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const reject = useMutation({
    mutationFn: () => api.post(`/registrations/${registration._id}/reject`, { reason }),
    onSuccess: () => {
      toast(`Registration for ${registration.name} rejected`, 'warning');
      qc.invalidateQueries({ queryKey: ['registrations'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not reject registration.', 'error'),
  });

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-xmark" /> Reject {registration.name}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg"><label className="fl">Reason (optional, shown to the applicant)</label><input className="fc" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Employee ID doesn't match our records" autoFocus /></div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn brd bsm" disabled={reject.isPending} onClick={() => reject.mutate()}>
            <i className="fa-solid fa-xmark" /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegistrationsPage() {
  const [status, setStatus] = useState('pending');
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const { data: items = [] } = useQuery({
    queryKey: ['registrations', status],
    queryFn: () => api.get('/registrations', { params: { status } }).then((r) => r.data.items),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Employee Registrations</div>
          <div className="pgs">Review self-signups before they can log in</div>
        </div>
      </div>
      <div className="chips">
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <div key={s} className={`chip${status === s ? ' on' : ''}`} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>{s}</div>
        ))}
      </div>

      {items.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 8 }}>No {status !== 'all' ? status : ''} registrations.</div>}

      <div className="g3" style={{ marginTop: 8 }}>
        {items.map((r) => (
          <div key={r._id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar name={r.name} index={r.avatarIndex} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{r.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{r.email}</div>
              </div>
              <Badge color={STATUS_COLOR[r.approvalStatus] || 'gray'}>{r.approvalStatus}</Badge>
            </div>
            {[['Employee ID', r.empId], ['Mobile', r.phone], ['Department', r.department], ['Date of Birth', formatDate(r.dob)], ['Date of Joining', formatDate(r.joined)]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--bd)' }}>
                <span style={{ color: 'var(--t3)' }}>{l}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            {r.approvalStatus === 'rejected' && r.rejectionReason && (
              <div style={{ fontSize: 11, color: 'var(--red, #E74C3C)', marginTop: 6 }}>Reason: {r.rejectionReason}</div>
            )}
            {r.approvalStatus === 'pending' && (
              <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                <button className="btn bgn bsm" style={{ flex: 1 }} onClick={() => setApproving(r)}><i className="fa-solid fa-check" /> Approve</button>
                <button className="btn brd bsm" style={{ flex: 1 }} onClick={() => setRejecting(r)}><i className="fa-solid fa-xmark" /> Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {approving && <ApproveModal registration={approving} onClose={() => setApproving(null)} />}
      {rejecting && <RejectModal registration={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}
