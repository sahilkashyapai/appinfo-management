import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import Select from '../components/Select';
import { formatDateTime } from '../utils/avatar';

const ACTION_BADGE = { LOGIN: 'b-bl', LOGIN_FAILED: 'b-re', CREATE: 'b-gr', UPDATE: 'b-or', DELETE: 'b-re', EXPORT: 'b-pu' };

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['audit', q, action, entity, page],
    queryFn: () => api.get('/audit', { params: { q, action, entity, page, limit: 20 } }).then((r) => r.data),
  });

  async function exportCsv() {
    const res = await api.get('/audit/export.csv', { params: { q, action, entity }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Audit Logs</div>
          <div className="pgs">Immutable change history</div>
        </div>
        <div className="ph-r">
          <button className="btn bs bsm" onClick={exportCsv}><i className="fa-solid fa-download" /> Export CSV</button>
        </div>
      </div>
      <div className="card mb13">
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="hs-inner" style={{ flex: 1, minWidth: 160 }}>
            <i className="fa-solid fa-magnifying-glass" />
            <input type="text" placeholder="Search actor, entity, action…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select style={{ width: 130 }} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="all">All Actions</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGIN_FAILED">LOGIN_FAILED</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="EXPORT">EXPORT</option>
          </Select>
          <Select style={{ width: 130 }} value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            <option value="all">All Entities</option>
            <option value="users">users</option>
            <option value="employees">employees</option>
            <option value="events">events</option>
            <option value="departments">departments</option>
            <option value="wall_posts">wall_posts</option>
            <option value="announcements">announcements</option>
            <option value="holidays">holidays</option>
            <option value="settings">settings</option>
          </Select>
        </div>
      </div>
      <div className="card">
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Record ID</th><th>IP Address</th><th>Details</th></tr>
            </thead>
            <tbody>
              {data?.items.map((l) => (
                <tr key={l._id}>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{formatDateTime(l.createdAt)}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={l.actorName} size={22} fontSize={7} />{l.actorName}</div></td>
                  <td><span className={`badge ${ACTION_BADGE[l.action] || 'b-gy'}`}>{l.action}</span></td>
                  <td><code style={{ fontSize: 10, background: 'var(--bg3)', padding: '2px 6px', borderRadius: 5, color: 'var(--t1)' }}>{l.entity}</code></td>
                  <td style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'monospace' }}>{l.recordId}</td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', fontFamily: 'monospace' }}>{l.ip}</td>
                  <td style={{ fontSize: 11, color: 'var(--t2)' }}>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>Showing page {data.page} of {data.pages} ({data.total} entries)</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn bs bxs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <button className="btn bs bxs" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
