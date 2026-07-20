import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import KpiCard from '../components/KpiCard';
import Avatar from '../components/Avatar';
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

  const { data: summary } = useQuery({ queryKey: ['reports-summary', month], queryFn: () => api.get('/reports/summary', { params: { month } }).then((r) => r.data) });
  const { data: byDept = [] } = useQuery({ queryKey: ['reports-dept', month], queryFn: () => api.get('/reports/birthdays-by-department', { params: { month } }).then((r) => r.data.items) });
  const { data: eventDist = [] } = useQuery({ queryKey: ['reports-events'], queryFn: () => api.get('/reports/event-type-distribution').then((r) => r.data.items) });
  const { data: birthdayReport = [] } = useQuery({ queryKey: ['reports-birthdays', month], queryFn: () => api.get('/reports/birthday-report', { params: { month } }).then((r) => r.data.items) });

  const maxDept = Math.max(...byDept.map((d) => d.count), 1);
  const EVENT_COLORS = { festival: '#E67E22', workshop: '#8E44AD', town_hall: '#2E86AB', team_outing: '#27AE60', sports: '#E74C3C', birthday: '#F39C12', other: '#6B7A93' };

  function exportExcel() {
    downloadCsv(
      `birthday-report-${month}.csv`,
      birthdayReport.map((r) => [r.name, r.dept, formatDate(r.dob), r.years, r.wishesReceived]),
      ['Employee', 'Department', 'Birthday', 'Years at AII', 'Wishes Received']
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
    </div>
  );
}
