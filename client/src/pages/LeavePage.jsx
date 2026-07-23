import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import LeaveRequestModal from '../components/LeaveRequestModal';
import PromptModal from '../components/PromptModal';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/avatar';
import { ADMIN_ROLES } from '../utils/roles';

const PROMPT_CONFIG = {
  reject: { title: 'Reject Leave Request', label: 'Reason (optional)', placeholder: 'e.g. Team is short-staffed that week', submitLabel: 'Reject' },
  hold: { title: 'Put Leave Request on Hold', label: 'Reason (optional)', placeholder: 'e.g. Waiting on manager confirmation', submitLabel: 'Put on Hold' },
  comment: { title: 'Add Comment', label: 'Comment for the employee', placeholder: 'Write a note…', required: true, multiline: true, submitLabel: 'Add Comment' },
};

const STATUS_BADGE = { pending: 'b-or', on_hold: 'b-pu', approved: 'b-gr', rejected: 'b-re', cancelled: 'b-gy' };
const STATUS_LABEL = { pending: 'pending', on_hold: 'on hold', approved: 'approved', rejected: 'rejected', cancelled: 'cancelled' };
const TYPE_LABEL = { casual: 'Casual', sick: 'Sick', earned: 'Earned' };
const TYPE_COLOR = { casual: 'var(--accent)', sick: 'var(--orange)', earned: 'var(--green)' };
const CURRENT_YEAR = new Date().getFullYear();

function downloadCsv(filename, rows, headers) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeavePage() {
  const { user } = useAuth();
  const canApprove = ADMIN_ROLES.includes(user?.role);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(canApprove && searchParams.get('tab') === 'approvals' ? 'approvals' : 'mine');
  const [reportYear, setReportYear] = useState(CURRENT_YEAR);
  const [formOpen, setFormOpen] = useState(false);
  const [promptFor, setPromptFor] = useState(null); // { type: 'reject'|'hold'|'comment', id }
  const toast = useToast();
  const qc = useQueryClient();

  const { data: balanceData } = useQuery({
    queryKey: ['leave-balance'],
    queryFn: () => api.get('/leave/balance').then((r) => r.data.balance),
  });
  const { data: mine } = useQuery({
    queryKey: ['leave-requests', 'mine'],
    queryFn: () => api.get('/leave/requests/mine').then((r) => r.data.items),
  });
  const { data: pending } = useQuery({
    queryKey: ['leave-requests', 'pending'],
    queryFn: () => api.get('/leave/requests', { params: { status: 'pending' } }).then((r) => r.data.items),
    enabled: canApprove && tab === 'approvals',
  });
  const { data: report } = useQuery({
    queryKey: ['leave-report', reportYear],
    queryFn: () => api.get('/leave/report', { params: { year: reportYear } }).then((r) => r.data.items),
    enabled: tab === 'report',
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leave-requests'] });
    qc.invalidateQueries({ queryKey: ['leave-balance'] });
  };

  const cancel = useMutation({
    mutationFn: (id) => api.patch(`/leave/requests/${id}/cancel`),
    onSuccess: () => {
      toast('Leave request cancelled', 'info');
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not cancel request.', 'error'),
  });

  const approve = useMutation({
    mutationFn: (id) => api.patch(`/leave/requests/${id}/approve`),
    onSuccess: () => {
      toast('Leave request approved ✓', 'success');
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not approve request.', 'error'),
  });

  const reject = useMutation({
    mutationFn: ({ id, note }) => api.patch(`/leave/requests/${id}/reject`, { note }),
    onSuccess: () => {
      toast('Leave request rejected', 'warning');
      setPromptFor(null);
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not reject request.', 'error'),
  });

  const hold = useMutation({
    mutationFn: ({ id, note }) => api.patch(`/leave/requests/${id}/hold`, { note }),
    onSuccess: () => {
      toast('Leave request put on hold', 'info');
      setPromptFor(null);
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update request.', 'error'),
  });

  const addComment = useMutation({
    mutationFn: ({ id, text }) => api.post(`/leave/requests/${id}/comments`, { text }),
    onSuccess: () => {
      toast('Comment added', 'success');
      setPromptFor(null);
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not add comment.', 'error'),
  });

  function submitPrompt(value) {
    if (!promptFor) return;
    const { type, id } = promptFor;
    if (type === 'reject') reject.mutate({ id, note: value });
    else if (type === 'hold') hold.mutate({ id, note: value });
    else if (type === 'comment') addComment.mutate({ id, text: value });
  }

  function exportReport() {
    downloadCsv(
      `leave-report-${reportYear}.csv`,
      (report || []).map((r) => [
        r.name, r.dept, r.byType.casual.used, r.byType.sick.used, r.byType.earned.used, r.totalUsed, r.pending, r.onHold, r.approved, r.rejected,
      ]),
      ['Employee', 'Department', 'Casual Used', 'Sick Used', 'Earned Used', 'Total Used', 'Pending', 'On Hold', 'Approved', 'Rejected']
    );
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Leave</div>
          <div className="pgs">Request time off and track approvals</div>
        </div>
        <div className="ph-r">
          <button className="btn bp bsm" onClick={() => setFormOpen(true)}><i className="fa-solid fa-plus" /> Request Leave</button>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab${tab === 'mine' ? ' on' : ''}`} onClick={() => setTab('mine')}>My Requests</div>
        {canApprove && <div className={`tab${tab === 'approvals' ? ' on' : ''}`} onClick={() => setTab('approvals')}>Approvals</div>}
        <div className={`tab${tab === 'report' ? ' on' : ''}`} onClick={() => setTab('report')}>Report</div>
      </div>

      {tab === 'mine' && (
        <>
          <div className="g3 mb13">
            {balanceData && Object.entries(balanceData).map(([type, b]) => (
              <div className="card" key={type}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                  {TYPE_LABEL[type]} Leave
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>{b.used} of {b.allocated} days used</div>
                <div className="sbar"><div className="sfill" style={{ width: `${b.allocated ? Math.min((b.used / b.allocated) * 100, 100) : 0}%`, background: TYPE_COLOR[type] }} /></div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="chd"><div className="cht"><i className="fa-solid fa-list" /> My Requests</div></div>
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {mine?.map((r) => (
                    <tr key={r._id}>
                      <td>{TYPE_LABEL[r.type]}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.startDate)} – {formatDate(r.endDate)}</td>
                      <td>{r.days}</td>
                      <td style={{ color: 'var(--t3)' }}>
                        {r.reason}
                        {r.comments?.length > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 3 }} title={r.comments.map((c) => c.text).join('\n')}>
                            <i className="fa-solid fa-comment" /> {r.comments[r.comments.length - 1].text}
                          </div>
                        )}
                      </td>
                      <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                      <td>
                        {r.status === 'pending' && (
                          <button className="btn brd bxs bico" onClick={() => cancel.mutate(r._id)} disabled={cancel.isPending}>
                            <i className="fa-solid fa-ban" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {mine?.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No leave requests yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'approvals' && canApprove && (
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-user-check" /> Pending Approvals</div></div>
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pending?.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={r.employeeRef?.name} index={r.employeeRef?.avatarIndex} size={22} fontSize={7} />
                        {r.employeeRef?.name}
                      </div>
                    </td>
                    <td>{TYPE_LABEL[r.type]}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.startDate)} – {formatDate(r.endDate)}</td>
                    <td>{r.days}</td>
                    <td style={{ color: 'var(--t3)' }}>
                      {r.reason}
                      {r.comments?.length > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 3 }} title={r.comments.map((c) => c.text).join('\n')}>
                          <i className="fa-solid fa-comment" /> {r.comments[r.comments.length - 1].text}
                        </div>
                      )}
                    </td>
                    <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn bgn bxs" onClick={() => approve.mutate(r._id)} disabled={approve.isPending}>
                          <i className="fa-solid fa-check" /> Approve
                        </button>
                        <button className="btn brd bxs" onClick={() => setPromptFor({ type: 'reject', id: r._id })} disabled={reject.isPending}>
                          <i className="fa-solid fa-xmark" /> Reject
                        </button>
                        {r.status === 'pending' && (
                          <button className="btn bor bxs" onClick={() => setPromptFor({ type: 'hold', id: r._id })} disabled={hold.isPending}>
                            <i className="fa-solid fa-pause" /> Hold
                          </button>
                        )}
                        <button className="btn bs bxs" onClick={() => setPromptFor({ type: 'comment', id: r._id })} disabled={addComment.isPending}>
                          <i className="fa-solid fa-comment" /> Comment
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pending?.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No pending requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className="card">
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-chart-column" /> {canApprove ? 'Leave Report — All Employees' : 'My Leave Report'}</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <Select style={{ width: 100 }} value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))}>
                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
              <button className="btn bs bxs" onClick={exportReport}><i className="fa-solid fa-download" /> Export</button>
            </div>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Employee</th><th>Casual</th><th>Sick</th><th>Earned</th><th>Total Used</th>
                  <th>Pending</th><th>On Hold</th><th>Approved</th><th>Rejected</th>
                </tr>
              </thead>
              <tbody>
                {report?.map((r) => (
                  <tr key={r.employeeId}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={r.name} index={r.avatarIndex} size={22} fontSize={7} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{r.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--t3)' }}>{r.dept}</div>
                        </div>
                      </div>
                    </td>
                    <td>{r.byType.casual.used}/{r.byType.casual.allocated}</td>
                    <td>{r.byType.sick.used}/{r.byType.sick.allocated}</td>
                    <td>{r.byType.earned.used}/{r.byType.earned.allocated}</td>
                    <td style={{ fontWeight: 700 }}>{r.totalUsed}</td>
                    <td>{r.pending > 0 ? <span className="badge b-or">{r.pending}</span> : <span style={{ color: 'var(--t3)' }}>0</span>}</td>
                    <td>{r.onHold > 0 ? <span className="badge b-pu">{r.onHold}</span> : <span style={{ color: 'var(--t3)' }}>0</span>}</td>
                    <td>{r.approved > 0 ? <span className="badge b-gr">{r.approved}</span> : <span style={{ color: 'var(--t3)' }}>0</span>}</td>
                    <td>{r.rejected > 0 ? <span className="badge b-re">{r.rejected}</span> : <span style={{ color: 'var(--t3)' }}>0</span>}</td>
                  </tr>
                ))}
                {report?.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No leave data for {reportYear}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && <LeaveRequestModal onClose={() => setFormOpen(false)} />}
      {promptFor && (
        <PromptModal
          {...PROMPT_CONFIG[promptFor.type]}
          pending={reject.isPending || hold.isPending || addComment.isPending}
          onSubmit={submitPrompt}
          onClose={() => setPromptFor(null)}
        />
      )}
    </div>
  );
}
