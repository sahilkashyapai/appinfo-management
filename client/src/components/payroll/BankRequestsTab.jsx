import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import Avatar from '../Avatar';
import ConfirmModal from '../ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { errMessage } from './payrollUtils';
import { formatDate } from '../../utils/avatar';
import { BANK_FIELDS, maskAccount } from '../BankDetailsFields';

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];
const STATUS_BADGE = { pending: 'b-or', approved: 'b-gr', rejected: 'b-re' };
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['bank-detail-requests'] });
    qc.invalidateQueries({ queryKey: ['payroll-structure'] });
  };
}

// Current vs requested values; changed rows are highlighted.
function Comparison({ current = {}, requested }) {
  const [show, setShow] = useState(false);
  const fmt = (key, v) => {
    if (!v) return <span style={{ color: 'var(--t3)' }}>—</span>;
    return key === 'bankAccount' && !show ? maskAccount(v) : v;
  };
  return (
    <div className="tbl" style={{ marginTop: 8 }}>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Current</th>
            <th>Requested</th>
          </tr>
        </thead>
        <tbody>
          {BANK_FIELDS.map(({ key, label }) => {
            const changed = (current[key] || '') !== (requested[key] || '');
            const cell = changed ? { background: 'rgba(230, 126, 34, .08)' } : undefined;
            return (
              <tr key={key}>
                <td style={cell}>
                  {label}
                  {key === 'bankAccount' && (current[key] || requested[key]) && (
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      style={{ background: 'none', border: 0, padding: 0, marginLeft: 6, cursor: 'pointer', color: 'var(--accent)', fontSize: 10.5, fontWeight: 700 }}
                    >
                      <i className={`fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}`} /> {show ? 'hide' : 'show'}
                    </button>
                  )}
                </td>
                <td style={cell}>{fmt(key, current[key])}</td>
                <td style={{ ...cell, ...(changed ? { color: 'var(--t1)', fontWeight: 700 } : {}) }}>
                  {fmt(key, requested[key])}
                  {changed && <span className="badge b-or" style={{ marginLeft: 6 }}>Changed</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RejectBox({ request, onDone }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [note, setNote] = useState('');
  const reject = useMutation({
    mutationFn: () => api.patch(`/bank-detail-requests/${request._id}`, { status: 'rejected', note: note.trim() }),
    onSuccess: () => {
      toast('Request rejected — the employee has been notified', 'success');
      invalidate();
      onDone();
    },
    onError: (err) => toast(errMessage(err, 'Could not reject the request.'), 'error'),
  });
  return (
    <div style={{ marginTop: 10 }}>
      <textarea
        className="fc"
        rows={3}
        maxLength={1000}
        placeholder="Tell the employee why, e.g. the IFSC doesn't match the bank name"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="btn bs bxs" onClick={onDone}>Cancel</button>
        <button className="btn brd bxs" disabled={!note.trim() || reject.isPending} onClick={() => reject.mutate()}>
          <i className="fa-solid fa-xmark" /> Reject request
        </button>
      </div>
    </div>
  );
}

export default function BankRequestsTab() {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [status, setStatus] = useState('pending');
  const [rejecting, setRejecting] = useState(null);
  const [approving, setApproving] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['bank-detail-requests', status],
    queryFn: () => api.get('/bank-detail-requests', { params: status ? { status } : {} }).then((r) => r.data.items),
  });

  const approve = useMutation({
    mutationFn: (id) => api.patch(`/bank-detail-requests/${id}`, { status: 'approved' }),
    onSuccess: () => {
      toast('Request approved — the new details are now on file', 'success');
      invalidate();
      setApproving(null);
    },
    onError: (err) => {
      setApproving(null);
      toast(errMessage(err, 'Could not approve the request.'), 'error');
    },
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.key || 'all'} className={`btn ${status === f.key ? 'bp' : 'bs'} bsm`} onClick={() => setStatus(f.key)}>{f.label}</button>
        ))}
      </div>

      {isLoading && <div style={{ fontSize: 12, color: 'var(--t3)' }}>Loading requests…</div>}
      {!isLoading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--t3)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}><i className="fa-solid fa-inbox" /></div>
          <div style={{ fontSize: 12.5 }}>
            {status === 'pending' ? 'No pending requests. Employees can ask to change their locked bank/PAN details from their profile.' : 'No requests here.'}
          </div>
        </div>
      )}

      {items.map((r) => {
        const who = r.employeeRef || r.user || {};
        return (
          <div key={r._id} className="card mb13">
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Avatar name={who.name} index={r.employeeRef?.avatarIndex} size={32} fontSize={11} />
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{who.name}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                    {r.employeeRef ? [r.employeeRef.empId, r.employeeRef.dept].filter(Boolean).join(' · ') : r.user?.email}
                  </span>
                  <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>Bank/PAN change request · submitted {formatDate(r.createdAt)}</div>
                {r.reason && <div style={{ fontSize: 13, margin: '8px 0', whiteSpace: 'pre-wrap' }}>{r.reason}</div>}
                <Comparison current={r.current} requested={r} />
                {r.status !== 'pending' && (
                  <div style={{ marginTop: 10, padding: '8px 10px', borderLeft: `3px solid ${r.status === 'approved' ? 'var(--green)' : 'var(--red)'}`, background: 'var(--bg3)', borderRadius: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: r.decisionNote ? 2 : 0 }}>
                      {STATUS_LABEL[r.status]} by {r.decidedByRef?.name || 'HR'}{r.decidedAt ? ` · ${formatDate(r.decidedAt)}` : ''}
                    </div>
                    {r.decisionNote && <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{r.decisionNote}</div>}
                  </div>
                )}
                {rejecting === r._id && <RejectBox request={r} onDone={() => setRejecting(null)} />}
              </div>
              {r.status === 'pending' && rejecting !== r._id && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn brd bxs" onClick={() => setRejecting(r._id)}><i className="fa-solid fa-xmark" /> Reject</button>
                  <button className="btn bp bxs" onClick={() => setApproving(r)}><i className="fa-solid fa-check" /> Approve</button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {approving && (
        <ConfirmModal
          title="Approve Change Request"
          message={`Replaces ${approving.employeeRef?.name || approving.user?.name || 'the employee'}'s PAN and bank details with the requested values. The employee will be notified.`}
          confirmLabel="Approve"
          pending={approve.isPending}
          onConfirm={() => approve.mutate(approving._id)}
          onClose={() => setApproving(null)}
        />
      )}
    </>
  );
}
