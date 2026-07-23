import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';

const GROUPS = [
  { key: 'office', label: 'Office', icon: 'fa-solid fa-building', color: '#27AE60' },
  { key: 'wfh', label: 'Work From Home', icon: 'fa-solid fa-house-laptop', color: '#8E44AD' },
  { key: 'leave', label: 'On Leave', icon: 'fa-solid fa-plane-departure', color: '#2E86AB' },
  { key: 'absent', label: 'Absent', icon: 'fa-solid fa-user-slash', color: '#E74C3C' },
  { key: 'notMarked', label: 'Not Marked Yet', icon: 'fa-solid fa-circle-question', color: '#6B7A93' },
];

export default function TeamAttendanceTodayPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-today-breakdown'],
    queryFn: () => api.get('/attendance/today-breakdown').then((r) => r.data),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Team Attendance Today</div>
          <div className="pgs">Who's in office, working from home, on leave, or absent today</div>
        </div>
        <div className="ph-r">
          <button className="btn bs bsm" onClick={() => navigate(-1)}><i className="fa-solid fa-arrow-left" /> Back</button>
        </div>
      </div>

      {isLoading && <div style={{ fontSize: 12, color: 'var(--t3)' }}>Loading…</div>}

      {data && (
        <div className="g2">
          {GROUPS.map((g) => {
            const items = data[g.key] || [];
            return (
              <div className="card" key={g.key}>
                <div className="chd">
                  <div className="cht"><i className={g.icon} style={{ color: g.color }} /> {g.label}</div>
                  <span className="badge b-bl">{items.length}</span>
                </div>
                {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>Nobody in this category today.</div>}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
