import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';

const MESSAGES = { yes: "RSVP confirmed — see you there! ✅", maybe: 'Tentative RSVP noted 🤔', no: 'RSVP declined ❌' };

export default function RsvpModal() {
  const { rsvpEventId, closeRsvp } = useDrawers();
  const [selected, setSelected] = useState(null);
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['event', rsvpEventId],
    queryFn: () => api.get(`/events/${rsvpEventId}`).then((r) => r.data.event),
    enabled: !!rsvpEventId,
  });

  const submit = useMutation({
    mutationFn: (status) => api.post(`/events/${rsvpEventId}/rsvp`, { status }),
    onSuccess: (_res, status) => {
      toast(MESSAGES[status], 'success');
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event', rsvpEventId] });
      close();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not submit RSVP.', 'error'),
  });

  function close() {
    setSelected(null);
    closeRsvp();
  }

  if (!rsvpEventId) return <div id="rsvp-m" />;

  return (
    <div id="rsvp-m" className={rsvpEventId ? 'open' : ''} onClick={(e) => e.target.id === 'rsvp-m' && close()}>
      <div className="rsvp-card">
        <div className="rsvp-banner" style={{ background: `${data?.color || '#2E86AB'}18` }}>{data?.emoji || '🎉'}</div>
        <div className="rsvp-body">
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--t1)', marginBottom: 3, letterSpacing: -0.2 }}>{data?.title || '—'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 2 }}>
            {data ? `${new Date(data.date).toLocaleDateString()} · ${data.venue}` : '—'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 14 }}>{data ? `${data.rsvp} of ${data.capacity} seats confirmed` : '—'}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 9 }}>Will you attend this event?</div>
          <div className="rsvp-opts">
            <div className={`rsvp-opt yes${selected === 'yes' ? ' sel' : ''}`} onClick={() => setSelected('yes')}>
              <div style={{ fontSize: 24, marginBottom: 5 }}>✅</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Yes</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>I'll be there</div>
            </div>
            <div className={`rsvp-opt maybe${selected === 'maybe' ? ' sel' : ''}`} onClick={() => setSelected('maybe')}>
              <div style={{ fontSize: 24, marginBottom: 5 }}>🤔</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Maybe</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>Tentatively</div>
            </div>
            <div className={`rsvp-opt no${selected === 'no' ? ' sel' : ''}`} onClick={() => setSelected('no')}>
              <div style={{ fontSize: 24, marginBottom: 5 }}>❌</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>No</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>Can't attend</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn bs bsm" onClick={close}>Cancel</button>
            <button className="btn bp bsm" disabled={!selected || submit.isPending} onClick={() => submit.mutate(selected)}>
              <i className="fa-solid fa-check" /> Confirm RSVP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
