import { useNotifications, useNotificationActions } from '../hooks/useNotifications';

export default function NotificationPanel({ open, onClose }) {
  const { data: notifs = [] } = useNotifications();
  const { markRead, markAllRead } = useNotificationActions();

  return (
    <div id="np" className={open ? 'open' : ''}>
      <div className="np-hd">
        <div className="np-title">Notifications</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn bs bxs" onClick={() => markAllRead.mutate()}>
            <i className="fa-solid fa-check-double" /> Mark All Read
          </button>
          <button className="btn bs bxs bico" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      </div>
      <div className="np-body">
        {notifs.map((n) => (
          <div key={n._id} className={`npi${n.unread ? ' unr' : ''}`} onClick={() => n.unread && markRead.mutate(n._id)}>
            <div className="npi-ico" style={{ background: n.bg }}>{n.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: n.unread ? 700 : 600, color: 'var(--t1)' }}>{n.title}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1, lineHeight: 1.5 }}>{n.body}</div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>
                <i className="fa-solid fa-clock" style={{ fontSize: 10 }} /> {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
            {n.unread && <div className="npi-pip" />}
          </div>
        ))}
        {notifs.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>No notifications yet.</div>}
      </div>
    </div>
  );
}
