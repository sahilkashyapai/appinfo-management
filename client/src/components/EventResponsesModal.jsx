import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from './Avatar';
import { formatDate } from '../utils/avatar';

const STATUS_META = {
  yes: { label: 'Attending', icon: 'fa-solid fa-circle-check', color: 'var(--green)' },
  maybe: { label: 'Maybe', icon: 'fa-solid fa-circle-question', color: 'var(--orange)' },
  no: { label: 'Declined', icon: 'fa-solid fa-circle-xmark', color: 'var(--red, #E74C3C)' },
};

export default function EventResponsesModal({ event, onClose }) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['event-rsvps', event._id],
    queryFn: () => api.get(`/events/${event._id}/rsvps`).then((r) => r.data.items),
  });

  const grouped = { yes: [], maybe: [], no: [] };
  (items || []).forEach((r) => {
    if (r.employeeRef && grouped[r.status]) grouped[r.status].push(r);
  });

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(520px, 92vw)', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className={event.emoji || 'fa-solid fa-calendar-days'} style={{ color: event.color }} /> {event.title}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span><i className="fa-solid fa-calendar" style={{ fontSize: 10, marginRight: 4 }} />{formatDate(event.date)}</span>
          <span><i className="fa-solid fa-location-dot" style={{ fontSize: 10, marginRight: 4 }} />{event.venue}</span>
          <span><i className="fa-solid fa-user-group" style={{ fontSize: 10, marginRight: 4 }} />{event.rsvp}/{event.capacity} attending</span>
        </div>

        {isLoading && <div style={{ fontSize: 12, color: 'var(--t3)', padding: '10px 0' }}>Loading responses…</div>}

        {!isLoading && (items || []).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--t3)', padding: '10px 0' }}>No one has responded yet.</div>
        )}

        {!isLoading && (items || []).length > 0 && (
          <>
            {['yes', 'maybe', 'no'].map((status) => (
              grouped[status].length > 0 && (
                <div key={status} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_META[status].color, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className={STATUS_META[status].icon} /> {STATUS_META[status].label} ({grouped[status].length})
                  </div>
                  {grouped[status].map((r) => (
                    <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
                      <Avatar name={r.employeeRef.name} index={r.employeeRef.avatarIndex} size={28} fontSize={9} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{r.employeeRef.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{r.employeeRef.dept} · {r.employeeRef.desig}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ))}
          </>
        )}
      </div>
    </div>
  );
}
