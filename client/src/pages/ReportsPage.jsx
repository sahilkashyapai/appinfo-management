import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import KpiCard from '../components/KpiCard';
import Avatar from '../components/Avatar';
import { formatDate, formatDateTime } from '../utils/avatar';

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

  const { data: summary } = useQuery({ queryKey: ['reports-summary', month], queryFn: () => api.get('/reports/summary', { params: { month } }).then((r) => r.data) });
  const { data: byDept = [] } = useQuery({ queryKey: ['reports-dept', month], queryFn: () => api.get('/reports/birthdays-by-department', { params: { month } }).then((r) => r.data.items) });
  const { data: eventDist = [] } = useQuery({ queryKey: ['reports-events'], queryFn: () => api.get('/reports/event-type-distribution').then((r) => r.data.items) });
  const { data: birthdayReport = [] } = useQuery({ queryKey: ['reports-birthdays', month], queryFn: () => api.get('/reports/birthday-report', { params: { month } }).then((r) => r.data.items) });
  const { data: anniversaryReport = [] } = useQuery({ queryKey: ['reports-anniversaries', month], queryFn: () => api.get('/reports/anniversary-report', { params: { month } }).then((r) => r.data.items) });
  const { data: wallPostsReport = [] } = useQuery({ queryKey: ['reports-wall-posts', month], queryFn: () => api.get('/reports/wall-posts-report', { params: { month } }).then((r) => r.data.items) });
  const { data: notificationsReport = [] } = useQuery({ queryKey: ['reports-notifications', month], queryFn: () => api.get('/reports/notifications-report', { params: { month } }).then((r) => r.data.items) });
  const { data: attendanceReport = [] } = useQuery({ queryKey: ['reports-attendance', month], queryFn: () => api.get('/reports/attendance-report', { params: { month } }).then((r) => r.data.items) });

  const maxDept = Math.max(...byDept.map((d) => d.count), 1);
  const EVENT_COLORS = { festival: '#E67E22', workshop: '#8E44AD', town_hall: '#2E86AB', team_outing: '#27AE60', sports: '#E74C3C', birthday: '#F39C12', other: '#6B7A93' };

  function exportExcel() {
    downloadCsv(
      `birthday-report-${month}.csv`,
      birthdayReport.map((r) => [r.name, r.dept, formatDate(r.dob), r.years, r.wishesReceived]),
      ['Employee', 'Department', 'Birthday', 'Years at AII', 'Wishes Received']
    );
  }

  function exportAnniversaries() {
    downloadCsv(
      `anniversary-report-${month}.csv`,
      anniversaryReport.map((r) => [r.name, r.dept, formatDate(r.joined), r.years, r.wishesReceived]),
      ['Employee', 'Department', 'Anniversary Date', 'Years at AII', 'Wishes Received']
    );
  }

  function exportWallPosts() {
    downloadCsv(
      `wall-posts-report-${month}.csv`,
      wallPostsReport.map((r) => [r.author, r.text, r.tag, formatDateTime(r.createdAt)]),
      ['Author', 'Message', 'Tag', 'Posted On']
    );
  }

  function exportNotifications() {
    downloadCsv(
      `notifications-report-${month}.csv`,
      notificationsReport.map((r) => [r.title, r.type, r.recipient, formatDateTime(r.createdAt)]),
      ['Title', 'Type', 'Recipient', 'Sent On']
    );
  }

  function exportAttendance() {
    downloadCsv(
      `attendance-report-${month}.csv`,
      attendanceReport.map((r) => [r.name, r.dept, r.office, r.wfh, r.leave, r.absent, r.notMarked]),
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
          <input type="month" className="fc" style={{ width: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn bs bsm" onClick={() => window.print()}><i className="fa-solid fa-download" /> PDF</button>
          <button className="btn bgn bsm" onClick={exportExcel}><i className="fa-solid fa-file-excel" /> Excel</button>
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
          <div className="cht"><i className="fa-solid fa-table" /> Birthday Report</div>
          <button className="btn bs bxs" onClick={exportExcel}><i className="fa-solid fa-download" /> Export</button>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Birthday</th><th>Years at AII</th><th>Wishes Received</th></tr>
            </thead>
            <tbody>
              {birthdayReport.map((r) => (
                <tr key={r.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={r.name} size={24} fontSize={8} /><span style={{ fontWeight: 600 }}>{r.name}</span></div></td>
                  <td><span className="badge b-bl">{r.dept}</span></td>
                  <td>{formatDate(r.dob)}</td>
                  <td style={{ fontWeight: 700 }}>{r.years} yrs</td>
                  <td><span className="badge b-pu">{r.wishesReceived} wishes</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {birthdayReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No birthdays this month.</div>}
      </div>

      <div className="card" style={{ marginTop: 13 }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-medal" /> Anniversary Report</div>
          <button className="btn bs bxs" onClick={exportAnniversaries}><i className="fa-solid fa-download" /> Export</button>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Anniversary Date</th><th>Years at AII</th><th>Wishes Received</th></tr>
            </thead>
            <tbody>
              {anniversaryReport.map((r) => (
                <tr key={r.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={r.name} size={24} fontSize={8} /><span style={{ fontWeight: 600 }}>{r.name}</span></div></td>
                  <td><span className="badge b-bl">{r.dept}</span></td>
                  <td>{formatDate(r.joined)}</td>
                  <td style={{ fontWeight: 700 }}>{r.years} yrs</td>
                  <td><span className="badge b-pu">{r.wishesReceived} wishes</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {anniversaryReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No anniversaries this month.</div>}
      </div>

      <div className="card" style={{ marginTop: 13 }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-envelope-open" /> Wall Posts Report</div>
          <button className="btn bs bxs" onClick={exportWallPosts}><i className="fa-solid fa-download" /> Export</button>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Author</th><th>Message</th><th>Tag</th><th>Posted On</th></tr>
            </thead>
            <tbody>
              {wallPostsReport.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.author}</td>
                  <td style={{ maxWidth: 360 }}>{r.text}</td>
                  <td><span className="badge b-bl">{r.tag}</span></td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {wallPostsReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No wall posts this month.</div>}
      </div>

      <div className="card" style={{ marginTop: 13 }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-bell" /> Notifications Report</div>
          <button className="btn bs bxs" onClick={exportNotifications}><i className="fa-solid fa-download" /> Export</button>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Title</th><th>Type</th><th>Recipient</th><th>Sent On</th></tr>
            </thead>
            <tbody>
              {notificationsReport.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.title}</td>
                  <td><span className="badge b-or">{r.type}</span></td>
                  <td>{r.recipient}</td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notificationsReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No notifications this month.</div>}
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
              {attendanceReport.map((r) => (
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
        {attendanceReport.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>No employees found.</div>}
      </div>
    </div>
  );
}
