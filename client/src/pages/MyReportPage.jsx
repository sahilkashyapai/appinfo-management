import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import MonthPicker from '../components/MonthPicker';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/avatar';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MyReportPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonthValue());
  const employeeId = user?.employeeRef;

  const { data: attendanceReport = [] } = useQuery({
    queryKey: ['my-report-attendance', month, employeeId],
    queryFn: () => api.get('/reports/attendance-report', { params: { month, employeeId } }).then((r) => r.data.items),
    enabled: !!employeeId,
  });
  const { data: leaveReport = [] } = useQuery({
    queryKey: ['my-report-leave', month, employeeId],
    queryFn: () => api.get('/reports/leave-report', { params: { month, employeeId } }).then((r) => r.data.items),
    enabled: !!employeeId,
  });
  const { data: absentReport = [] } = useQuery({
    queryKey: ['my-report-absent', month, employeeId],
    queryFn: () => api.get('/reports/absent-report', { params: { month, employeeId } }).then((r) => r.data.items),
    enabled: !!employeeId,
  });
  const { data: workModeReport = [] } = useQuery({
    queryKey: ['my-report-work-mode', month, employeeId],
    queryFn: () => api.get('/reports/work-mode-report', { params: { month, employeeId } }).then((r) => r.data.items),
    enabled: !!employeeId,
  });

  if (!employeeId) {
    return (
      <div className="page on">
        <div className="ph">
          <div className="ph-l">
            <div className="pgt">My Report</div>
            <div className="pgs">Attendance, leave &amp; WFH summary</div>
          </div>
        </div>
        <div className="card" style={{ fontSize: 12, color: 'var(--t3)' }}>No employee record is linked to your account.</div>
      </div>
    );
  }

  const totals = attendanceReport[0] || { office: 0, wfh: 0, leave: 0, absent: 0, notMarked: 0 };
  const maxCount = Math.max(totals.office, totals.wfh, totals.leave, totals.absent, 1);

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">My Report</div>
          <div className="pgs">Your attendance, leave &amp; WFH summary — visible only to you and admins</div>
        </div>
        <div className="ph-r">
          <MonthPicker style={{ width: 150 }} value={month} onChange={setMonth} />
        </div>
      </div>

      <div className="card mb13">
        <div className="chd"><div className="cht"><i className="fa-solid fa-calendar-check" /> Attendance Summary</div></div>
        <div className="cbr">
          <div className="cbl">Office</div>
          <div className="cbb"><div className="cbf" style={{ width: `${Math.round((totals.office / maxCount) * 100)}%`, background: '#27AE60' }}>{totals.office}</div></div>
          <div className="cbv">{totals.office}</div>
        </div>
        <div className="cbr">
          <div className="cbl">WFH</div>
          <div className="cbb"><div className="cbf" style={{ width: `${Math.round((totals.wfh / maxCount) * 100)}%`, background: '#8E44AD' }}>{totals.wfh}</div></div>
          <div className="cbv">{totals.wfh}</div>
        </div>
        <div className="cbr">
          <div className="cbl">Leave</div>
          <div className="cbb"><div className="cbf" style={{ width: `${Math.round((totals.leave / maxCount) * 100)}%`, background: '#2E86AB' }}>{totals.leave}</div></div>
          <div className="cbv">{totals.leave}</div>
        </div>
        <div className="cbr">
          <div className="cbl">Absent</div>
          <div className="cbb"><div className="cbf" style={{ width: `${Math.round((totals.absent / maxCount) * 100)}%`, background: '#E74C3C' }}>{totals.absent}</div></div>
          <div className="cbv">{totals.absent}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>Not marked: {totals.notMarked}</div>
      </div>

      <div className="card mb13">
        <div className="chd"><div className="cht"><i className="fa-solid fa-plane-departure" /> Leave Days</div></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Date</th><th>Note</th></tr></thead>
            <tbody>
              {leaveReport.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td style={{ color: 'var(--t3)' }}>{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leaveReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No leave days this month.</div>}
      </div>

      <div className="card mb13">
        <div className="chd"><div className="cht"><i className="fa-solid fa-user-slash" /> Absences</div></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Date</th><th>Note</th></tr></thead>
            <tbody>
              {absentReport.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td style={{ color: 'var(--t3)' }}>{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {absentReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No absences this month.</div>}
      </div>

      <div className="card">
        <div className="chd"><div className="cht"><i className="fa-solid fa-house-laptop" /> Work Mode by Day</div></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Date</th><th>Mode</th></tr></thead>
            <tbody>
              {workModeReport.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td><span className={r.status === 'wfh' ? 'badge b-pu' : 'badge b-gr'}>{r.status === 'wfh' ? 'Work From Home' : 'Office'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {workModeReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No office/WFH records this month.</div>}
      </div>
    </div>
  );
}
