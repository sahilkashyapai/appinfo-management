import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import ConfirmModal from '../components/ConfirmModal';
import DatePicker from '../components/DatePicker';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STATUS_BADGE = { running: 'b-gr', paused: 'b-or', stopped: 'b-bl' };
const STATUS_LABEL = { running: 'Running', paused: 'Paused', stopped: 'Stopped' };

function formatClock(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  if (ms == null) return '—';
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function liveElapsed(t) {
  const end = t.status === 'running' ? Date.now() : t.status === 'paused' ? new Date(t.pausedAt).getTime() : new Date(t.stoppedAt).getTime();
  return end - new Date(t.startedAt).getTime() - t.totalPausedMs;
}

export default function TimeTrackingPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  const { data: liveData } = useQuery({
    queryKey: ['time-tracking', 'today'],
    queryFn: () => api.get('/time-tracking/today').then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data } = useQuery({
    queryKey: ['time-tracking', 'report', from, to, page],
    queryFn: () => api.get('/time-tracking', { params: { from, to, page, limit: 20 } }).then((r) => r.data),
  });

  const clearData = useMutation({
    mutationFn: () => api.delete('/time-tracking', { data: { from, to } }),
    onSuccess: (res) => {
      toast(`Deleted ${res.data.deletedCount} record(s).`, 'success');
      qc.invalidateQueries({ queryKey: ['time-tracking'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not clear data.', 'error'),
  });

  const clearAllData = useMutation({
    mutationFn: () => api.delete('/time-tracking/all'),
    onSuccess: (res) => {
      toast(`Deleted ${res.data.deletedCount} record(s).`, 'success');
      qc.invalidateQueries({ queryKey: ['time-tracking'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not clear data.', 'error'),
  });

  function resetDateRange() {
    setFrom('');
    setTo('');
    setPage(1);
  }

  function handleClear() {
    if (!from && !to) {
      toast('Pick a From and/or To date first.', 'error');
      return;
    }
    setConfirmingClear(true);
  }

  const clearRangeLabel = from && to ? `between ${from} and ${to}` : from ? `from ${from} onward` : `up to ${to}`;

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Time Tracking</div>
          <div className="pgs">Employee work timer status and daily report</div>
        </div>
      </div>

      <div className="card mb13">
        <div className="chd"><div className="cht"><i className="fa-solid fa-tower-broadcast" /> Live Today</div></div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>User</th><th>Status</th><th>Started At</th><th>Elapsed</th><th>IP Address</th></tr>
            </thead>
            <tbody>
              {liveData?.items.map((t) => (
                <tr key={t._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={t.userRef?.name} index={t.userRef?.avatarIndex} src={t.userRef?.avatarUrl} size={22} fontSize={7} />
                      {t.userRef?.name || 'Unknown user'}
                    </div>
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[t.status] || 'b-gy'}`}>{STATUS_LABEL[t.status] || t.status}</span></td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', fontFamily: 'monospace' }}>{formatClock(t.startedAt)}</td>
                  <td style={{ fontSize: 11, color: 'var(--t2)' }}>{formatDuration(liveElapsed(t))}</td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', fontFamily: 'monospace' }}>{t.ip}</td>
                </tr>
              ))}
              {liveData && liveData.items.length === 0 && (
                <tr><td colSpan={5} style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', padding: 14 }}>No one has started their timer today.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb13">
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="fg"><label className="fl">From</label><DatePicker value={from} onChange={(v) => { setFrom(v); setPage(1); }} max={to || undefined} /></div>
            <div className="fg"><label className="fl">To</label><DatePicker value={to} onChange={(v) => { setTo(v); setPage(1); }} min={from || undefined} /></div>
            <div className="fg">
              <label className="fl" style={{ visibility: 'hidden' }}>Reset</label>
              <button className="btn bs" style={{ padding: '8px 13px' }} onClick={resetDateRange} disabled={!from && !to}>
                <i className="fa-solid fa-rotate-left" /> Reset
              </button>
            </div>
          </div>
          {user?.role === 'superadmin' && (
            <button className="btn brd bsm" onClick={handleClear} disabled={clearData.isPending}>
              <i className="fa-solid fa-trash" /> Clear Data in Range
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="chd"><div className="cht"><i className="fa-solid fa-calendar-days" /> Daily Report</div></div>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Date</th><th>User</th><th>Start Time</th><th>Total Pause</th><th>Stop Time</th><th>Total Hours</th></tr>
            </thead>
            <tbody>
              {data?.items.map((t) => (
                <tr key={t._id}>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString('en-IN')}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={t.userRef?.name} index={t.userRef?.avatarIndex} src={t.userRef?.avatarUrl} size={22} fontSize={7} />
                      {t.userRef?.name || 'Unknown user'}
                    </div>
                  </td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', fontFamily: 'monospace' }}>{formatClock(t.startedAt)}</td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)' }}>{formatDuration(t.totalPausedMs)}</td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', fontFamily: 'monospace' }}>
                    {t.status === 'stopped' ? formatClock(t.stoppedAt) : <span className={`badge ${STATUS_BADGE[t.status]}`}>{STATUS_LABEL[t.status]}</span>}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--t2)' }}>{t.status === 'stopped' ? formatDuration(liveElapsed(t)) : '—'}</td>
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

      {user?.role === 'superadmin' && (
        <div className="card" style={{ marginTop: 13, borderColor: 'var(--red)' }}>
          <div className="chd"><div className="cht"><i className="fa-solid fa-triangle-exclamation" /> Danger Zone</div></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>Permanently erase every employee's login-time record, for every date. This cannot be undone.</div>
            <button className="btn brd bsm" onClick={() => setConfirmingClearAll(true)} disabled={clearAllData.isPending}>
              <i className="fa-solid fa-dumpster-fire" /> Clear All Login Time Data
            </button>
          </div>
        </div>
      )}
      {confirmingClear && (
        <ConfirmModal
          title="Clear Time-Tracking Data"
          message={`Permanently delete all time-tracking records ${clearRangeLabel}? This cannot be undone.`}
          confirmLabel="Delete Records"
          danger
          pending={clearData.isPending}
          onConfirm={() => {
            clearData.mutate();
            setConfirmingClear(false);
          }}
          onClose={() => setConfirmingClear(false)}
        />
      )}
      {confirmingClearAll && (
        <ConfirmModal
          title="Clear All Login-Time Data"
          message="Permanently delete ALL login-time records for ALL users, for every date? This cannot be undone."
          confirmLabel="Delete Everything"
          danger
          pending={clearAllData.isPending}
          onConfirm={() => {
            clearAllData.mutate();
            setConfirmingClearAll(false);
          }}
          onClose={() => setConfirmingClearAll(false)}
        />
      )}
    </div>
  );
}
