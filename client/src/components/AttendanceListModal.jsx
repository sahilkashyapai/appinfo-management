import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from './Avatar';

const TITLES = { office: 'In Office Today', wfh: 'Working From Home Today', leave: 'On Leave Today', absent: 'Absent Today', not_marked: 'Not Marked Yet Today' };

export default function AttendanceListModal({ status, onClose }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['attendance-today-list', status],
    queryFn: () => api.get('/attendance/today-list', { params: { status } }).then((r) => r.data.items),
  });

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 960, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(420px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht">{TITLES[status] || 'Attendance'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ overflowY: 'auto' }}>
          {isLoading && <div style={{ fontSize: 12, color: 'var(--t3)' }}>Loading…</div>}
          {!isLoading && items.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>No employees in this category today.</div>}
          {items.map((e) => (
            <div className="pr" key={e._id}>
              <Avatar name={e.name} index={e.avatarIndex} size={30} fontSize={10} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{e.dept}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
