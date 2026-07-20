import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';
import { daysUntilNext } from '../utils/avatar';

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'upcoming', label: 'Upcoming' },
];

export default function BirthdaysPage() {
  const [tab, setTab] = useState('today');
  const { openEmployee } = useDrawers();
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['employees-all-active'],
    queryFn: () => api.get('/employees', { params: { status: 'active', limit: 100 } }).then((r) => r.data.items),
  });

  const wish = useMutation({
    mutationFn: (text) => api.post('/wall', { text, tag: 'birthday' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wall'] }),
  });

  const withDays = useMemo(() => (data || []).map((e) => ({ ...e, days: daysUntilNext(e.dob) })).sort((a, b) => a.days - b.days), [data]);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'today':
        return withDays.filter((e) => e.days === 0);
      case 'week':
        return withDays.filter((e) => e.days <= 7);
      case 'month':
        return withDays.filter((e) => e.days <= 31);
      default:
        return withDays.filter((e) => e.days > 31 && e.days <= 90);
    }
  }, [withDays, tab]);

  const todayCount = withDays.filter((e) => e.days === 0).length;

  function sendWish(e) {
    wish.mutate(`🎂 Happy Birthday, ${e.name}! Wishing you a fantastic year ahead! 🎉`, {
      onSuccess: () => toast(`Wish sent to ${e.name}! 🎂`, 'birthday'),
    });
  }

  function sendBulk() {
    const todays = withDays.filter((e) => e.days === 0);
    if (!todays.length) {
      toast('No birthdays today.', 'info');
      return;
    }
    Promise.all(todays.map((e) => api.post('/wall', { text: `🎂 Happy Birthday, ${e.name}! 🎉`, tag: 'birthday' }))).then(() => {
      toast(`Bulk wishes sent to ${todays.length} employee(s)! 🎂`, 'birthday');
      qc.invalidateQueries({ queryKey: ['wall'] });
    });
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Birthday Management</div>
          <div className="pgs">{todayCount} today · {withDays.filter((e) => e.days <= 31).length} this month</div>
        </div>
        <div className="ph-r">
          <button className="btn bp bsm" onClick={sendBulk}><i className="fa-solid fa-paper-plane" /> Send Bulk Wishes</button>
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</div>
        ))}
      </div>
      <div className="g4">
        {filtered.map((e) => (
          <div key={e._id} className="card" style={{ textAlign: 'center', padding: 15 }}>
            <Avatar name={e.name} index={e.avatarIndex} size={52} fontSize={17} onClick={() => openEmployee(e._id)} style={{ margin: '0 auto 9px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t1)', marginBottom: 2 }}>🎂 {e.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>{e.dept}</div>
            <div style={{ fontSize: 10.5, color: 'var(--t3)', marginBottom: 9 }}>{e.desig}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', marginBottom: 9 }}>
              {e.days === 0 ? 'Birthday Today!' : `In ${e.days} day${e.days === 1 ? '' : 's'}`}
            </div>
            <button className="btn bp" style={{ width: '100%', fontSize: 11 }} onClick={() => sendWish(e)}>
              <i className="fa-solid fa-heart" /> Send Wishes
            </button>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12 }}>No birthdays in this range.</div>}
      </div>
    </div>
  );
}
