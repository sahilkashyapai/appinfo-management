import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatHM(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatClock(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function WorkTimerCard() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const toast = useToast();
  const qc = useQueryClient();
  const [, setTick] = useState(0);

  const { data } = useQuery({
    queryKey: ['time-tracking', 'me', 'today'],
    queryFn: () => api.get('/time-tracking/me/today').then((r) => r.data),
    refetchInterval: 30000,
    enabled: !isSuperadmin,
  });

  const status = data?.timer?.status;
  useEffect(() => {
    if (status !== 'running') return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['time-tracking', 'me', 'today'] });
  const onError = (err) => toast(err.response?.data?.message || 'Something went wrong.', 'error');

  const start = useMutation({ mutationFn: () => api.post('/time-tracking/start'), onSuccess: invalidate, onError });
  const pause = useMutation({ mutationFn: () => api.post('/time-tracking/pause'), onSuccess: invalidate, onError });
  const resume = useMutation({ mutationFn: () => api.post('/time-tracking/resume'), onSuccess: invalidate, onError });
  const stop = useMutation({ mutationFn: () => api.post('/time-tracking/stop'), onSuccess: invalidate, onError });

  if (isSuperadmin || !data || !data.enabled) return null;
  const timer = data.timer;

  let elapsedMs = 0;
  if (timer) {
    const end =
      timer.status === 'running' ? Date.now() : timer.status === 'paused' ? new Date(timer.pausedAt).getTime() : new Date(timer.stoppedAt).getTime();
    elapsedMs = end - new Date(timer.startedAt).getTime() - timer.totalPausedMs;
  }

  return (
    <div className="card mb14">
      <div className="chd">
        <div className="cht"><i className="fa-solid fa-stopwatch" /> Work Timer</div>
        {timer?.status === 'running' && <span className="badge b-gr">Running</span>}
        {timer?.status === 'paused' && <span className="badge b-or">Paused</span>}
        {timer?.status === 'stopped' && <span className="badge b-bl">{timer.autoStopped ? 'Auto-stopped' : 'Completed'}</span>}
      </div>

      {!timer && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>You haven't started your timer today.</div>
          <button className="btn bgn" onClick={() => start.mutate()} disabled={start.isPending}>
            <i className="fa-solid fa-play" /> Start Timer
          </button>
        </div>
      )}

      {timer && timer.status !== 'stopped' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: 'var(--t1)' }}>{formatHMS(elapsedMs)}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>Started at {formatClock(timer.startedAt)}</div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {timer.status === 'running' && (
              <button className="btn bor" onClick={() => pause.mutate()} disabled={pause.isPending}>
                <i className="fa-solid fa-pause" /> Pause
              </button>
            )}
            {timer.status === 'paused' && (
              <button className="btn bgn" onClick={() => resume.mutate()} disabled={resume.isPending}>
                <i className="fa-solid fa-play" /> Resume
              </button>
            )}
            <button className="btn brd" onClick={() => stop.mutate()} disabled={stop.isPending}>
              <i className="fa-solid fa-stop" /> Stop
            </button>
          </div>
        </div>
      )}

      {timer && timer.status === 'stopped' && (
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>
          Started {formatClock(timer.startedAt)} · Stopped {formatClock(timer.stoppedAt)} · Paused {formatHM(timer.totalPausedMs)} · Total worked{' '}
          <strong>{formatHM(elapsedMs)}</strong>
          {timer.autoStopped && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Automatically stopped after 10 hours.</div>}
        </div>
      )}
    </div>
  );
}
