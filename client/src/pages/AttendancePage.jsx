import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import PromptModal from '../components/PromptModal';
import AttendanceCorrectionModal from '../components/AttendanceCorrectionModal';
import DatePicker from '../components/DatePicker';
import MonthPicker from '../components/MonthPicker';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/avatar';
import { ADMIN_ROLES } from '../utils/roles';
import { STATUSES, STATUS_LABEL, STATUS_BADGE } from '../utils/attendance';

const CORRECTION_STATUS_BADGE = { pending: 'b-or', approved: 'b-gr', rejected: 'b-re' };
const STATUS_LABEL_WITH_NOT_MARKED = { ...STATUS_LABEL, not_marked: 'Not Marked' };

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const canMark = ['superadmin', 'hr'].includes(user?.role);
  const canViewTeam = ADMIN_ROLES.includes(user?.role);
  const toast = useToast();
  const qc = useQueryClient();

  const [markDate, setMarkDate] = useState(todayInputDate());
  const [historyEmployeeId, setHistoryEmployeeId] = useState('');
  const [month, setMonth] = useState(currentMonthValue());
  const [correctionDate, setCorrectionDate] = useState(null);
  const [rejectingCorrection, setRejectingCorrection] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all-light'],
    queryFn: () => api.get('/employees', { params: { limit: 200 } }).then((r) => r.data.items),
    enabled: canMark || canViewTeam,
  });

  const { data: dayStatuses = {}, isLoading: dayLoading } = useQuery({
    queryKey: ['attendance-day', markDate],
    queryFn: () =>
      api.get('/attendance', { params: { from: markDate, to: markDate } }).then((r) =>
        Object.fromEntries(r.data.items.map((a) => [a.employeeRef?._id, a.status]))
      ),
    enabled: canMark,
  });

  const mark = useMutation({
    mutationFn: ({ employeeRef, status }) => api.post('/attendance', { employeeRef, date: markDate, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-day', markDate] });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-history'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save attendance.', 'error'),
  });

  const historyTargetId = canViewTeam ? historyEmployeeId : user?.employeeRef;
  const { data: history = [] } = useQuery({
    queryKey: ['attendance-history', historyTargetId, month],
    queryFn: () => api.get('/attendance', { params: { employeeId: historyTargetId || undefined, month } }).then((r) => r.data.items),
    enabled: canViewTeam ? !!historyEmployeeId : true,
  });

  const exportPdf = useMutation({
    mutationFn: async () => {
      const params = { month };
      if (historyEmployeeId) params.employeeId = historyEmployeeId;
      const res = await api.get('/attendance/export.pdf', { params, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${month}${historyEmployeeId ? '' : '-all'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast('Could not export PDF.', 'error'),
  });

  const { data: myCorrections = [] } = useQuery({
    queryKey: ['attendance-corrections', 'mine'],
    queryFn: () => api.get('/attendance/corrections/mine').then((r) => r.data.items),
    enabled: !canMark,
  });
  const { data: pendingCorrections = [] } = useQuery({
    queryKey: ['attendance-corrections', 'pending'],
    queryFn: () => api.get('/attendance/corrections', { params: { status: 'pending' } }).then((r) => r.data.items),
    enabled: canMark,
  });

  const invalidateCorrections = () => {
    qc.invalidateQueries({ queryKey: ['attendance-corrections'] });
    qc.invalidateQueries({ queryKey: ['attendance-history'] });
    qc.invalidateQueries({ queryKey: ['attendance-today'] });
  };

  const approveCorrection = useMutation({
    mutationFn: (id) => api.patch(`/attendance/corrections/${id}/approve`),
    onSuccess: () => {
      toast('Correction approved ✓', 'success');
      invalidateCorrections();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not approve request.', 'error'),
  });

  const rejectCorrection = useMutation({
    mutationFn: ({ id, note }) => api.patch(`/attendance/corrections/${id}/reject`, { note }),
    onSuccess: () => {
      toast('Correction rejected', 'warning');
      setRejectingCorrection(null);
      invalidateCorrections();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not reject request.', 'error'),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Attendance</div>
          <div className="pgs">{canMark ? 'Mark daily status and review history' : 'Your attendance history'}</div>
        </div>
        {!canMark && (
          <div className="ph-r">
            <button className="btn bs bsm" onClick={() => setCorrectionDate(todayInputDate())}>
              <i className="fa-solid fa-triangle-exclamation" /> Request Correction
            </button>
          </div>
        )}
      </div>

      {canMark && (
        <div className="card mb13">
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-calendar-check" /> Mark Attendance</div>
            <DatePicker style={{ width: 160 }} value={markDate} onChange={setMarkDate} max={todayInputDate()} />
          </div>
          {dayLoading ? (
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>Loading…</div>
          ) : (
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Employee</th><th>Department</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={e.name} index={e.avatarIndex} src={e.userRef?.avatarUrl} size={26} fontSize={9} />
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                        </div>
                      </td>
                      <td><span className="badge b-bl">{e.dept}</span></td>
                      <td>
                        <Select
                          style={{ width: 150 }}
                          value={dayStatuses[e._id] || ''}
                          disabled={mark.isPending}
                          onChange={(ev) => mark.mutate({ employeeRef: e._id, status: ev.target.value })}
                        >
                          <option value="" disabled>Select…</option>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-clock-rotate-left" /> History</div>
          <div style={{ display: 'flex', gap: 7 }}>
            {canViewTeam && (
              <Select style={{ width: 180 }} value={historyEmployeeId} onChange={(e) => setHistoryEmployeeId(e.target.value)}>
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </Select>
            )}
            <MonthPicker style={{ width: 150 }} value={month} onChange={setMonth} />
            {canMark && (
              <button className="btn bs bsm" disabled={exportPdf.isPending} onClick={() => exportPdf.mutate()}>
                <i className="fa-solid fa-file-pdf" /> Export PDF
              </button>
            )}
          </div>
        </div>
        {canViewTeam && !historyEmployeeId ? (
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>Pick an employee to view their attendance history.</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Date</th><th>Status</th><th>Marked By</th>{!canMark && historyTargetId === user?.employeeRef && <th>Actions</th>}</tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h._id}>
                    <td>{formatDate(h.date)}</td>
                    <td><span className={`badge ${STATUS_BADGE[h.status]}`}>{STATUS_LABEL[h.status]}</span></td>
                    <td>{h.markedBy?.name || '—'}</td>
                    {!canMark && historyTargetId === user?.employeeRef && (
                      <td>
                        <button className="btn bs bxs bico" title="Request correction" onClick={() => setCorrectionDate(new Date(h.date).toISOString().slice(0, 10))}>
                          <i className="fa-solid fa-triangle-exclamation" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={!canMark && historyTargetId === user?.employeeRef ? 4 : 3} style={{ color: 'var(--t3)', fontSize: 12 }}>No attendance records for this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!canMark && (
        <div className="card" style={{ marginTop: 13 }}>
          <div className="chd"><div className="cht"><i className="fa-solid fa-file-circle-check" /> My Correction Requests</div></div>
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Date</th><th>Current</th><th>Requested</th><th>Reason</th><th>Status</th></tr>
              </thead>
              <tbody>
                {myCorrections.map((r) => (
                  <tr key={r._id}>
                    <td>{formatDate(r.date)}</td>
                    <td>{STATUS_LABEL_WITH_NOT_MARKED[r.currentStatus]}</td>
                    <td style={{ fontWeight: 700 }}>{STATUS_LABEL[r.requestedStatus]}</td>
                    <td style={{ color: 'var(--t3)' }}>
                      {r.reason}
                      {r.status === 'rejected' && r.decisionNote && (
                        <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>Reason: {r.decisionNote}</div>
                      )}
                    </td>
                    <td><span className={`badge ${CORRECTION_STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                  </tr>
                ))}
                {myCorrections.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No correction requests yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canMark && (
        <div className="card" style={{ marginTop: 13 }}>
          <div className="chd"><div className="cht"><i className="fa-solid fa-inbox" /> Pending Correction Requests</div></div>
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Employee</th><th>Date</th><th>Current</th><th>Requested</th><th>Reason</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pendingCorrections.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={r.employeeRef?.name} index={r.employeeRef?.avatarIndex} size={22} fontSize={7} />
                        {r.employeeRef?.name}
                      </div>
                    </td>
                    <td>{formatDate(r.date)}</td>
                    <td>{STATUS_LABEL_WITH_NOT_MARKED[r.currentStatus]}</td>
                    <td style={{ fontWeight: 700 }}>{STATUS_LABEL[r.requestedStatus]}</td>
                    <td style={{ color: 'var(--t3)' }}>{r.reason}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn bgn bxs" onClick={() => approveCorrection.mutate(r._id)} disabled={approveCorrection.isPending}>
                          <i className="fa-solid fa-check" /> Approve
                        </button>
                        <button className="btn brd bxs" onClick={() => setRejectingCorrection(r._id)} disabled={rejectCorrection.isPending}>
                          <i className="fa-solid fa-xmark" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendingCorrections.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No pending correction requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {correctionDate && <AttendanceCorrectionModal defaultDate={correctionDate} onClose={() => setCorrectionDate(null)} />}
      {rejectingCorrection && (
        <PromptModal
          title="Reject Correction Request"
          label="Reason (optional)"
          placeholder="e.g. No supporting evidence for the change"
          submitLabel="Reject"
          pending={rejectCorrection.isPending}
          onSubmit={(note) => rejectCorrection.mutate({ id: rejectingCorrection, note })}
          onClose={() => setRejectingCorrection(null)}
        />
      )}
    </div>
  );
}
