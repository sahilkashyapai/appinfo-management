import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import Avatar from './Avatar';

const ADMIN_ROLES = ['superadmin', 'hr', 'manager'];
const APPROVER_ROLES = ['superadmin', 'hr'];

// Full nav for superadmin/hr/manager — the management/admin panel.
const ADMIN_NAV = [
  { section: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'fa-solid fa-gauge' }] },
  {
    section: 'People',
    items: [
      { to: '/employees', label: 'Employees', icon: 'fa-solid fa-users' },
      { to: '/birthdays', label: 'Birthdays', icon: 'fa-solid fa-cake-candles' },
      { to: '/anniversaries', label: 'Anniversaries', icon: 'fa-solid fa-medal' },
    ],
  },
  {
    section: 'Celebrate',
    items: [
      { to: '/events', label: 'Events', icon: 'fa-solid fa-calendar-days' },
      { to: '/wall', label: 'Celebration Wall', icon: 'fa-solid fa-heart' },
      { to: '/calendar', label: 'Calendar', icon: 'fa-solid fa-calendar' },
    ],
  },
  {
    section: 'Communicate',
    items: [
      { action: 'notifications', label: 'Notifications', icon: 'fa-solid fa-bell' },
      { to: '/announcements', label: 'Announcements', icon: 'fa-solid fa-bullhorn' },
    ],
  },
  {
    section: 'Admin',
    items: [
      { to: '/registrations', label: 'Registrations', icon: 'fa-solid fa-user-check', roles: APPROVER_ROLES },
      { to: '/departments', label: 'Departments', icon: 'fa-solid fa-building' },
      { to: '/holidays', label: 'Holidays', icon: 'fa-solid fa-umbrella-beach' },
      { to: '/reports', label: 'Reports', icon: 'fa-solid fa-chart-column' },
      { to: '/audit', label: 'Audit Logs', icon: 'fa-solid fa-magnifying-glass-chart' },
      { to: '/settings', label: 'Settings', icon: 'fa-solid fa-gear' },
    ],
  },
];

// Simplified nav for the 'employee' self-service user panel — no employee/department
// management, no reports/audit/settings.
const EMPLOYEE_NAV = [
  { section: 'Overview', items: [{ to: '/', label: 'My Dashboard', icon: 'fa-solid fa-gauge' }] },
  {
    section: 'Celebrate',
    items: [
      { to: '/birthdays', label: 'Birthdays', icon: 'fa-solid fa-cake-candles' },
      { to: '/anniversaries', label: 'Anniversaries', icon: 'fa-solid fa-medal' },
      { to: '/events', label: 'Events', icon: 'fa-solid fa-calendar-days' },
      { to: '/wall', label: 'Celebration Wall', icon: 'fa-solid fa-heart' },
      { to: '/calendar', label: 'Calendar', icon: 'fa-solid fa-calendar' },
    ],
  },
  {
    section: 'Communicate',
    items: [
      { action: 'notifications', label: 'Notifications', icon: 'fa-solid fa-bell' },
      { to: '/announcements', label: 'Announcements', icon: 'fa-solid fa-bullhorn' },
    ],
  },
];

export default function Sidebar({ onOpenNotifications }) {
  const { user } = useAuth();
  const { data: notifs = [] } = useNotifications();
  const unread = notifs.filter((n) => n.unread).length;

  const isAdminPanel = ADMIN_ROLES.includes(user?.role);
  const nav = (isAdminPanel ? ADMIN_NAV : EMPLOYEE_NAV)
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(user?.role)) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside id="sb">
      <div className="sb-brand">
        <div className="sb-bic"><i className="fa-solid fa-champagne-glasses" /></div>
        <div className="sb-bt">
          <div className="l1">AII Celebrations</div>
          <div className="l2">{isAdminPanel ? 'Applied Information India' : 'Employee Portal'}</div>
        </div>
      </div>
      <nav className="sb-nav">
        {nav.map((group) => (
          <div key={group.section}>
            <div className="sb-sec">{group.section}</div>
            {group.items.map((item) =>
              item.action === 'notifications' ? (
                <div key="notifications" className="ni" onClick={onOpenNotifications}>
                  <i className={item.icon} />
                  {item.label}
                  {unread > 0 && <span className="nb">{unread}</span>}
                </div>
              ) : (
                <NavLink key={item.to} to={item.to} end className={({ isActive }) => `ni${isActive ? ' on' : ''}`}>
                  <i className={item.icon} />
                  {item.label}
                </NavLink>
              )
            )}
          </div>
        ))}
      </nav>
      <NavLink to="/profile" className="sb-user">
        <Avatar name={user?.name} index={user?.avatarIndex} size={30} style={{ border: '2px solid rgba(255,255,255,.15)' }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{user?.name}</div>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.3)' }}>{user?.email}</div>
        </div>
        <i className="fa-solid fa-chevron-right" style={{ color: 'rgba(255,255,255,.2)', fontSize: 12, marginLeft: 'auto' }} />
      </NavLink>
    </aside>
  );
}
