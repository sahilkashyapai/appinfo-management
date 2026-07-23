import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import KpiCard from '../components/KpiCard';
import Avatar from '../components/Avatar';
import MonthPicker from '../components/MonthPicker';
import Select from '../components/Select';
import { formatDate } from '../utils/avatar';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [employeeId, setEmployeeId] = useState('');

  const { data: employees = [] } = useQuery({ queryKey: ['employees-all-light'], queryFn: () => api.get('/employees', { params: { limit: 200 } }).then((r) => r.data.items) });
  const { data: summary } = useQuery({ queryKey: ['reports-summary', month], queryFn: () => api.get('/reports/summary', { params: { month } }).then((r) => r.data) });
  const { data: byDept = [] } = useQuery({ queryKey: ['reports-dept', month], queryFn: () => api.get('/reports/birthdays-by-department', { params: { month } }).then((r) => r.data.items) });
  const { data: eventDist = [] } = useQuery({ queryKey: ['reports-events'], queryFn: () => api.get('/reports/event-type-distribution').then((r) => r.data.items) });
  const { data: leaveReport = [] } = useQuery({ queryKey: ['reports-leave', month], queryFn: () => api.get('/reports/leave-report', { params: { month } }).then((r) => r.data.items) });
  const { data: absentReport = [] } = useQuery({ queryKey: ['reports-absent', month], queryFn: () => api.get('/reports/absent-report', { params: { month } }).then((r) => r.data.items) });
  const { data: workModeReport = [] } = useQuery({ queryKey: ['reports-work-mode', month], queryFn: () => api.get('/reports/work-mode-report', { params: { month } }).then((r) => r.data.items) });
  const { data: attendanceReport = [] } = useQuery({ queryKey: ['reports-attendance', month], queryFn: () => api.get('/reports/attendance-report', { params: { month } }).then((r) => r.data.items) });

  const selectedEmployee = employeeId ? employees.find((e) => e._id === employeeId) : null;
  const filteredLeave = employeeId ? leaveReport.filter((r) => String(r.employeeId) === String(employeeId)) : leaveReport;
  const filteredAbsent = employeeId ? absentReport.filter((r) => String(r.employeeId) === String(employeeId)) : absentReport;
  const filteredWorkMode = employeeId ? workModeReport.filter((r) => String(r.employeeId) === String(employeeId)) : workModeReport;
  const filteredAttendance = employeeId ? attendanceReport.filter((r) => String(r.id) === String(employeeId)) : attendanceReport;

  // Per-employee office/WFH totals for the aggregated (all-employees) work-mode view.
  const workModeSummary = Object.values(
    workModeReport.reduce((acc, r) => {
      const key = String(r.employeeId);
      acc[key] = acc[key] || { employeeId: key, name: r.name, dept: r.dept, office: 0, wfh: 0 };
      acc[key][r.status] += 1;
      return acc;
    }, {})
  ).sort((a, b) => a.name.localeCompare(b.name));

  const selectedOfficeCount = filteredWorkMode.filter((r) => r.status === 'office').length;
  const selectedWfhCount = filteredWorkMode.filter((r) => r.status === 'wfh').length;
  const maxModeCount = Math.max(selectedOfficeCount, selectedWfhCount, 1);

  const maxDept = Math.max(...byDept.map((d) => d.count), 1);
  const EVENT_COLORS = { festival: '#E67E22', workshop: '#8E44AD', town_hall: '#2E86AB', team_outing: '#27AE60', sports: '#E74C3C', birthday: '#F39C12', other: '#6B7A93' };

  function exportLeave() {
    downloadCsv(
      `leave-report-${month}.csv`,
      filteredLeave.map((r) => [r.name, r.dept, formatDate(r.date), r.note]),
      ['Employee', 'Department', 'Date', 'Note']
    );
  }

  function exportAbsent() {
    downloadCsv(
      `absent-report-${month}.csv`,
      filteredAbsent.map((r) => [r.name, r.dept, formatDate(r.date), r.note]),
      ['Employee', 'Department', 'Date', 'Note']
    );
  }

  function exportWorkMode() {
    if (employeeId) {
      downloadCsv(
        `work-mode-report-${month}.csv`,
        filteredWorkMode.map((r) => [r.name, r.dept, formatDate(r.date), r.status === 'wfh' ? 'Work From Home' : 'Office']),
        ['Employee', 'Department', 'Date', 'Mode']
      );
    } else {
      downloadCsv(
        `work-mode-report-${month}.csv`,
        workModeSummary.map((r) => [r.name, r.dept, r.office, r.wfh]),
        ['Employee', 'Department', 'Office', 'WFH']
      );
    }
  }

  function exportAttendance() {
    downloadCsv(
      `attendance-report-${month}.csv`,
      filteredAttendance.map((r) => [r.name, r.dept, r.office, r.wfh, r.leave, r.absent, r.notMarked]),
      ['Employee', 'Department', 'Office', 'WFH', 'Leave', 'Absent', 'Not Marked']
    );
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Reports &amp; Analytics</div>
          <div className="pgs">Applied Information India Pvt. Ltd.</div>
        </div>
        <div className="ph-r">
          <Select style={{ width: 180 }} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e._id} value={e._id}>{e.name}</option>
            ))}
          </Select>
          <MonthPicker style={{ width: 150 }} value={month} onChange={setMonth} />
          <button className="btn bs bsm" onClick={() => window.print()}><i className="fa-solid fa-download" /> PDF</button>
          <button className="btn bgn bsm" onClick={exportAttendance}><i className="fa-solid fa-file-excel" /> Excel</button>
        </div>
      </div>

      <div className="g4 mb13">
        <KpiCard value={summary?.birthdaysThisMonth ?? '—'} label="Birthdays This Month" bg="#EBF5FB" icon="fa-solid fa-cake-candles" iconColor="#2E86AB" />
        <KpiCard value={summary?.anniversariesThisMonth ?? '—'} label="Anniversaries" bg="#D5F5E3" icon="fa-solid fa-medal" iconColor="#27AE60" />
        <KpiCard value={summary?.notificationsSent ?? '—'} label="Notifications Sent" bg="#FDEBD0" icon="fa-solid fa-bell" iconColor="#E67E22" />
        <KpiCard value={summary?.wallPostsCount ?? '—'} label="Wall Posts" bg="#E8DAEF" icon="fa-solid fa-envelope-open" iconColor="#8E44AD" />
      </div>

      <div className="g2 mb13">
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-chart-column" /> Birthdays by Department</div></div>
          {byDept.map((d) => (
            <div className="cbr" key={d.dept}>
              <div className="cbl">{d.dept.split(' ')[0]}</div>
              <div className="cbb"><div className="cbf" style={{ width: `${Math.round((d.count / maxDept) * 100)}%`, background: '#2E86AB' }}>{d.count}</div></div>
              <div className="cbv">{d.count}</div>
            </div>
          ))}
          {byDept.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>No birthdays this month.</div>}
        </div>
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-chart-pie" /> Event Type Distribution</div></div>
          {eventDist.map((t) => (
            <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: EVENT_COLORS[t.type], flexShrink: 0 }} />
              <div style={{ fontSize: 11, color: 'var(--t2)', flex: 1 }}>{t.type.replace('_', ' ')}</div>
              <div className="cbb" style={{ flex: 2, height: 16 }}><div className="cbf" style={{ width: `${t.pct}%`, background: EVENT_COLORS[t.type] }} /></div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t1)', width: 28 }}>{t.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-plane-departure" /> Leave Report</div>
          <button className="btn bs bxs" onClick={exportLeave}><i className="fa-solid fa-download" /> Export</button>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Date</th><th>Note</th></tr>
            </thead>
            <tbody>
              {filteredLeave.map((r) => (
                <tr key={r.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={r.name} size={24} fontSize={8} /><span style={{ fontWeight: 600 }}>{r.name}</span></div></td>
                  <td><span className="badge b-bl">{r.dept}</span></td>
                  <td>{formatDate(r.date)}</td>
                  <td style={{ color: 'var(--t3)' }}>{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLeave.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>{employeeId ? 'No leave days for this employee this month.' : 'No leave days this month.'}</div>}
      </div>

      <div className="card" style={{ marginTop: 13 }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-slash" /> Absent Report</div>
          <button className="btn bs bxs" onClick={exportAbsent}><i className="fa-solid fa-download" /> Export</button>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Date</th><th>Note</th></tr>
            </thead>
            <tbody>
              {filteredAbsent.map((r) => (
                <tr key={r.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={r.name} size={24} fontSize={8} /><span style={{ fontWeight: 600 }}>{r.name}</span></div></td>
                  <td><span className="badge b-bl">{r.dept}</span></td>
                  <td>{formatDate(r.date)}</td>
                  <td style={{ color: 'var(--t3)' }}>{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAbsent.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>{employeeId ? 'No absences for this employee this month.' : 'No absences this month.'}</div>}
      </div>

      <div className="card" style={{ marginTop: 13 }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-house-laptop" /> Work From Home / Office Report</div>
          <button className="btn bs bxs" onClick={exportWorkMode}><i className="fa-solid fa-download" /> Export</button>
        </div>

        {employeeId ? (
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Avatar name={selectedEmployee?.name} size={30} fontSize={10} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{selectedEmployee?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{selectedEmployee?.dept}</div>
              </div>
            </div>
            <div className="cbr">
              <div className="cbl">Office</div>
              <div className="cbb"><div className="cbf" style={{ width: `${Math.round((selectedOfficeCount / maxModeCount) * 100)}%`, background: '#27AE60' }}>{selectedOfficeCount}</div></div>
              <div className="cbv">{selectedOfficeCount}</div>
            </div>
            <div className="cbr">
              <div className="cbl">WFH</div>
              <div className="cbb"><div className="cbf" style={{ width: `${Math.round((selectedWfhCount / maxModeCount) * 100)}%`, background: '#8E44AD' }}>{selectedWfhCount}</div></div>
              <div className="cbv">{selectedWfhCount}</div>
            </div>

            {filteredWorkMode.length > 0 && (
              <div className="tbl" style={{ marginTop: 14 }}>
                <table>
                  <thead>
                    <tr><th>Date</th><th>Mode</th></tr>
                  </thead>
                  <tbody>
                    {filteredWorkMode.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.date)}</td>
                        <td><span className={r.status === 'wfh' ? 'badge b-pu' : 'badge b-gr'}>{r.status === 'wfh' ? 'Work From Home' : 'Office'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filteredWorkMode.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 10 }}>No office/WFH records for this employee this month.</div>}
          </div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Employee</th><th>Department</th><th>Office</th><th>WFH</th></tr>
              </thead>
              <tbody>
                {workModeSummary.map((r) => (
                  <tr key={r.employeeId}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={r.name} size={24} fontSize={8} /><span style={{ fontWeight: 600 }}>{r.name}</span></div></td>
                    <td><span className="badge b-bl">{r.dept}</span></td>
                    <td><span className="badge b-gr">{r.office}</span></td>
                    <td><span className="badge b-pu">{r.wfh}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!employeeId && workModeSummary.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No records this month.</div>}
      </div>

      <div className="card" style={{ marginTop: 13 }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-calendar-check" /> Attendance Report</div>
          <button className="btn bs bxs" onClick={exportAttendance}><i className="fa-solid fa-download" /> Export</button>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Office</th><th>WFH</th><th>Leave</th><th>Absent</th><th>Not Marked</th></tr>
            </thead>
            <tbody>
              {filteredAttendance.map((r) => (
                <tr key={r.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={r.name} size={24} fontSize={8} /><span style={{ fontWeight: 600 }}>{r.name}</span></div></td>
                  <td><span className="badge b-bl">{r.dept}</span></td>
                  <td>{r.office}</td>
                  <td>{r.wfh}</td>
                  <td>{r.leave}</td>
                  <td>{r.absent}</td>
                  <td style={{ color: 'var(--t3)' }}>{r.notMarked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAttendance.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No employees found.</div>}
      </div>
    </div>
  );
}
