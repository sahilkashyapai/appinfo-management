import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import Avatar from '../Avatar';
import SlipEditorModal from './SlipEditorModal';
import { useToast } from '../../context/ToastContext';
import { errMessage, formatMoney, periodLabel } from './payrollUtils';
import { formatDate } from '../../utils/avatar';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];
export const QUERY_STATUS_BADGE = { open: 'b-or', resolved: 'b-gr', rejected: 'b-re' };
export const QUERY_STATUS_LABEL = { open: 'Open', resolved: 'Resolved', rejected: 'Rejected' };

function SlipFacts({ slip }) {
  const facts = [
    ['Gross', formatMoney(slip.grossEarnings, slip.currency)],
    ['Deductions', formatMoney(slip.totalDeductions, slip.currency)],
    ['Net pay', formatMoney(slip.netPay, slip.currency)],
    ['LOP days', slip.lopDays],
    ['Paid leave', slip.paidLeaveDays ?? '—'],
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11.5, color: 'var(--t3)' }}>
      {facts.map(([label, value]) => (
        <span key={label}>{label}: <strong style={{ color: 'var(--t1)' }}>{value}</strong></span>
      ))}
    </div>
  );
}

function ReplyBox({ query, onDone }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [response, setResponse] = useState('');
  const respond = useMutation({
    mutationFn: (status) => api.patch(`/salary-queries/${query._id}`, { status, response }),
    onSuccess: (_r, status) => {
      toast(status === 'resolved' ? 'Query resolved — the employee has been notified' : 'Query rejected — the employee has been notified', 'success');
      qc.invalidateQueries({ queryKey: ['salary-queries'] });
      onDone();
    },
    onError: (err) => toast(errMessage(err, 'Could not save the reply.'), 'error'),
  });
  return (
    <div style={{ marginTop: 10 }}>
      <textarea
        className="fc"
        rows={3}
        maxLength={2000}
        placeholder="Reply to the employee, e.g. what was corrected or why the deduction stands"
        value={response}
        onChange={(e) => setResponse(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="btn bs bxs" onClick={onDone}>Cancel</button>
        <button className="btn brd bxs" disabled={!response.trim() || respond.isPending} onClick={() => respond.mutate('rejected')}>
          <i className="fa-solid fa-xmark" /> Reject
        </button>
        <button className="btn bp bxs" disabled={!response.trim() || respond.isPending} onClick={() => respond.mutate('resolved')}>
          <i className="fa-solid fa-check" /> Resolve
        </button>
      </div>
    </div>
  );
}

export default function QueriesTab() {
  const [status, setStatus] = useState('open');
  const [replying, setReplying] = useState(null);
  const [viewing, setViewing] = useState(null); // { slipId, period }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['salary-queries', status],
    queryFn: () => api.get('/salary-queries', { params: status ? { status } : {} }).then((r) => r.data.items),
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.key || 'all'} className={`btn ${status === f.key ? 'bp' : 'bs'} bsm`} onClick={() => setStatus(f.key)}>{f.label}</button>
        ))}
      </div>

      {isLoading && <div style={{ fontSize: 12, color: 'var(--t3)' }}>Loading queries…</div>}
      {!isLoading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--t3)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}><i className="fa-solid fa-inbox" /></div>
          <div style={{ fontSize: 12.5 }}>
            {status === 'open' ? 'No open salary queries. Employees can raise one from a published slip in My Documents.' : 'No queries here.'}
          </div>
        </div>
      )}

      {items.map((q) => (
        <div key={q._id} className="card mb13">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Avatar name={q.employeeRef?.name} index={q.employeeRef?.avatarIndex} size={32} fontSize={11} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{q.employeeRef?.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>{q.employeeRef?.empId} · {q.employeeRef?.dept}</span>
                <span className={`badge ${QUERY_STATUS_BADGE[q.status]}`}>{QUERY_STATUS_LABEL[q.status]}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>
                About the {periodLabel(q.slip?.period)} slip · raised {formatDate(q.createdAt)}
              </div>
              <div style={{ fontSize: 13, margin: '8px 0', whiteSpace: 'pre-wrap' }}>{q.message}</div>
              {q.slip && <SlipFacts slip={q.slip} />}
              {q.status !== 'open' && q.response && (
                <div style={{ marginTop: 10, padding: '8px 10px', borderLeft: '3px solid var(--accent)', background: 'var(--bg3)', borderRadius: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>
                    Reply by {q.respondedByRef?.name || 'HR'}{q.respondedAt ? ` · ${formatDate(q.respondedAt)}` : ''}
                  </div>
                  <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{q.response}</div>
                </div>
              )}
              {replying === q._id && <ReplyBox query={q} onDone={() => setReplying(null)} />}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {q.slip && (
                <button className="btn bs bxs" onClick={() => setViewing({ slipId: q.slip._id, period: q.slip.period })}>
                  <i className="fa-solid fa-file-invoice" /> Open slip
                </button>
              )}
              {q.status === 'open' && replying !== q._id && (
                <button className="btn bp bxs" onClick={() => setReplying(q._id)}><i className="fa-solid fa-reply" /> Reply</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {viewing && <SlipEditorModal slipId={viewing.slipId} period={viewing.period} onClose={() => setViewing(null)} />}
    </>
  );
}
