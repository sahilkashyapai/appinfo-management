import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import EventFormModal from '../components/EventFormModal';
import { formatDate } from '../utils/avatar';

const RSVP_BUTTON = {
  yes: { cls: 'bgn', icon: 'fa-solid fa-circle-check', label: 'Attending' },
  maybe: { cls: 'bor', icon: 'fa-solid fa-circle-question', label: 'Maybe' },
  no: { cls: 'brd', icon: 'fa-solid fa-circle-xmark', label: 'Declined' },
};

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'festival', label: 'Festival' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'town_hall', label: 'Town Hall' },
  { key: 'team_outing', label: 'Team Outing' },
  { key: 'sports', label: 'Sports' },
];

export default function EventsPage() {
  const [type, setType] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const { openRsvp } = useDrawers();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = ['superadmin', 'hr'].includes(user?.role);

  const { data } = useQuery({
    queryKey: ['events', type],
    queryFn: () => api.get('/events', { params: { type } }).then((r) => r.data.items),
  });

  const publish = useMutation({
    mutationFn: (id) => api.patch(`/events/${id}/publish`),
    onSuccess: (_res, id) => {
      const evt = data?.find((e) => e._id === id);
      toast(`${evt?.title || 'Event'} published! 🎉`, 'success');
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const visibleEvents = canManage ? data : (data || []).filter((e) => e.status === 'published');
  const published = (data || []).filter((e) => e.status === 'published').length;
  const draft = (data || []).filter((e) => e.status === 'draft').length;

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Events</div>
          <div className="pgs">
            {canManage ? <>{data?.length || 0} total · {published} published · {draft} draft</> : <>{published} upcoming</>}
          </div>
        </div>
        {canManage && (
          <div className="ph-r">
            <button className="btn bp bsm" onClick={() => setShowForm(true)}><i className="fa-solid fa-plus" /> Create Event</button>
          </div>
        )}
      </div>
      <div className="chips">
        {TYPES.map((t) => (
          <div key={t.key} className={`chip${type === t.key ? ' on' : ''}`} onClick={() => setType(t.key)}>{t.label}</div>
        ))}
      </div>
      <div className="g3">
        {visibleEvents?.map((e) => (
          <div key={e._id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ height: 72, background: `${e.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
              <div style={{ fontSize: 30 }}>{e.emoji}</div>
              <span className={`badge ${e.status === 'published' ? 'b-gr' : 'b-gy'}`} style={{ textTransform: 'capitalize' }}>{e.status}</span>
            </div>
            <div style={{ padding: 13 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t1)', marginBottom: 5 }}>{e.title}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fa-solid fa-calendar" style={{ fontSize: 10 }} />{formatDate(e.date)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fa-solid fa-location-dot" style={{ fontSize: 10 }} />{e.venue}
              </div>
              {e.rsvp > 0 && (
                <div style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)' }}>RSVPs</span>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{e.rsvp}/{e.capacity}</span>
                  </div>
                  <div className="sbar"><div className="sfill" style={{ width: `${Math.round((e.rsvp / e.capacity) * 100)}%`, background: e.color }} /></div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {e.status === 'draft' ? (
                  canManage && <button className="btn bgn bxs" onClick={() => publish.mutate(e._id)}><i className="fa-solid fa-check" /> Publish</button>
                ) : e.myRsvp ? (
                  <button className={`btn ${RSVP_BUTTON[e.myRsvp].cls} bxs`} onClick={() => openRsvp(e._id)}>
                    <i className={RSVP_BUTTON[e.myRsvp].icon} /> {RSVP_BUTTON[e.myRsvp].label}
                  </button>
                ) : (
                  <button className="btn bp bxs" onClick={() => openRsvp(e._id)}><i className="fa-solid fa-user-check" /> RSVP</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {visibleEvents?.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12 }}>No events in this category.</div>}
      </div>
      {showForm && <EventFormModal onClose={() => setShowForm(false)} />}
    </div>
  );
}
