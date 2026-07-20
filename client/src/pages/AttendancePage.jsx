import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/avatar';
import { ADMIN_ROLES } from '../utils/roles';
import { STATUSES, STATUS_LABEL, STATUS_BADGE } from '../utils/attendance';

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

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Attendance</div>
          <div className="pgs">{canMark ? 'Mark daily status and review history' : 'Your attendance history'}</div>
        </div>
      </div>

      {canMark && (
        <div className="card mb13">
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-calendar-check" /> Mark Attendance</div>
            <input type="date" className="fc" style={{ width: 160 }} value={markDate} onChange={(e) => setMarkDate(e.target.value)} max={todayInputDate()} />
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
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              className={`btn bxs ${dayStatuses[e._id] === s ? 'bp' : 'bs'}`}
                              disabled={mark.isPending}
                              onClick={() => mark.mutate({ employeeRef: e._id, status: s })}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
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
              <select className="fc" style={{ width: 180 }} value={historyEmployeeId} onChange={(e) => setHistoryEmployeeId(e.target.value)}>
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
              </select>
            )}
            <input type="month" className="fc" style={{ width: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} />
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
                <tr><th>Date</th><th>Status</th><th>Marked By</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h._id}>
                    <td>{formatDate(h.date)}</td>
                    <td><span className={`badge ${STATUS_BADGE[h.status]}`}>{STATUS_LABEL[h.status]}</span></td>
                    <td>{h.markedBy?.name || '—'}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={3} style={{ color: 'var(--t3)', fontSize: 12 }}>No attendance records for this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
