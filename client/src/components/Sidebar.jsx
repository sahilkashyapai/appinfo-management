import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import Avatar from './Avatar';
import { ADMIN_ROLES, APPROVER_ROLES } from '../utils/roles';

// Full nav for superadmin/hr/manager — the management/admin panel.
const ADMIN_NAV = [
  { section: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'fa-solid fa-gauge' }] },
  {
    section: 'People',
    items: [
      { to: '/employees', label: 'Employees', icon: 'fa-solid fa-users' },
      { to: '/org-chart', label: 'Org Chart', icon: 'fa-solid fa-sitemap' },
      { to: '/attendance', label: 'Attendance', icon: 'fa-solid fa-calendar-check' },
      { to: '/leave', label: 'Leave', icon: 'fa-solid fa-plane-departure' },
      { to: '/my-report', label: 'My Report', icon: 'fa-solid fa-chart-simple' },
      { to: '/documents', label: 'My Documents', icon: 'fa-solid fa-file-lines' },
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
      { to: '/messages', label: 'Messages', icon: 'fa-solid fa-comment-dots', badge: 'unreadMessages' },
      { to: '/announcements', label: 'Announcements', icon: 'fa-solid fa-bullhorn' },
    ],
  },
  {
    section: 'Admin',
    items: [
      { to: '/registrations', label: 'Registrations', icon: 'fa-solid fa-user-check', roles: APPROVER_ROLES },
      { to: '/admins', label: 'Admins', icon: 'fa-solid fa-user-shield' },
      { to: '/departments', label: 'Departments', icon: 'fa-solid fa-building' },
      { to: '/holidays', label: 'Holidays', icon: 'fa-solid fa-umbrella-beach' },
      { to: '/reports', label: 'Reports', icon: 'fa-solid fa-chart-column' },
      { to: '/audit', label: 'Audit Logs', icon: 'fa-solid fa-magnifying-glass-chart' },
      { to: '/time-tracking', label: 'Time Tracking', icon: 'fa-solid fa-clock' },
      { to: '/assets', label: 'Assets', icon: 'fa-solid fa-boxes-stacked', roles: ADMIN_ROLES },
      { to: '/settings', label: 'Settings', icon: 'fa-solid fa-gear' },
    ],
  },
];

// Simplified nav for the 'employee' self-service user panel — no employee/department
// management, no reports/audit/settings.
const EMPLOYEE_NAV = [
  { section: 'Overview', items: [{ to: '/', label: 'My Dashboard', icon: 'fa-solid fa-gauge' }] },
  {
    section: 'People',
    items: [
      { to: '/employees', label: 'Employees', icon: 'fa-solid fa-users' },
      { to: '/org-chart', label: 'Org Chart', icon: 'fa-solid fa-sitemap' },
      { to: '/attendance', label: 'My Attendance', icon: 'fa-solid fa-calendar-check' },
      { to: '/leave', label: 'Leave', icon: 'fa-solid fa-plane-departure' },
      { to: '/my-report', label: 'My Report', icon: 'fa-solid fa-chart-simple' },
      { to: '/documents', label: 'My Documents', icon: 'fa-solid fa-file-lines' },
    ],
  },
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
      { to: '/messages', label: 'Messages', icon: 'fa-solid fa-comment-dots', badge: 'unreadMessages' },
      { to: '/announcements', label: 'Announcements', icon: 'fa-solid fa-bullhorn' },
    ],
  },
];

export default function Sidebar({ open, onNavigate, onOpenNotifications }) {
  const { user, logout } = useAuth();
  const { data: notifs = [] } = useNotifications();
  const unread = notifs.filter((n) => n.unread).length;
  const { data: conversations = [] } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/chat/conversations').then((r) => r.data.items),
    refetchInterval: 30000,
  });
  const unreadMessages = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const BADGE_VALUE = { unreadMessages };

  const isAdminPanel = ADMIN_ROLES.includes(user?.role);
  const nav = (isAdminPanel ? ADMIN_NAV : EMPLOYEE_NAV)
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(user?.role)) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside id="sb" className={open ? 'mobile-open' : ''}>
      <div className="sb-brand">
        <div className="sb-blogo"><img src="/images/AI-horizontal-logo-R-gray-454x116-1.png" alt="Applied Information" /></div>
        <div className="sb-bt">
          <div className="l2">{isAdminPanel ? 'Applied Information India' : 'Employee Portal'}</div>
        </div>
      </div>
      <nav className="sb-nav">
        {nav.map((group) => (
          <div key={group.section}>
            <div className="sb-sec">{group.section}</div>
            {group.items.map((item) =>
              item.action === 'notifications' ? (
                <div
                  key="notifications"
                  className="ni"
                  onClick={() => {
                    onOpenNotifications();
                    onNavigate?.();
                  }}
                >
                  <i className={item.icon} />
                  {item.label}
                  {unread > 0 && <span className="nb">{unread}</span>}
                </div>
              ) : (
                <NavLink key={item.to} to={item.to} end className={({ isActive }) => `ni${isActive ? ' on' : ''}`} onClick={onNavigate}>
                  <i className={item.icon} />
                  {item.label}
                  {item.badge && BADGE_VALUE[item.badge] > 0 && <span className="nb">{BADGE_VALUE[item.badge]}</span>}
                </NavLink>
              )
            )}
          </div>
        ))}
      </nav>
      <NavLink to="/profile" className="sb-user" onClick={onNavigate}>
        <Avatar name={user?.name} index={user?.avatarIndex} src={user?.avatarUrl} size={30} style={{ border: '2px solid var(--sb-avatar-border)' }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sb-user-name)' }}>{user?.name}</div>
          <div style={{ fontSize: 9.5, color: 'var(--sb-user-email)' }}>{user?.email}</div>
        </div>
        <i className="fa-solid fa-chevron-right" style={{ color: 'var(--sb-chevron)', fontSize: 12, marginLeft: 'auto' }} />
      </NavLink>
      <div
        className="ni"
        style={{ margin: '4px 8px 10px' }}
        onClick={() => {
          logout();
          onNavigate?.();
        }}
      >
        <i className="fa-solid fa-right-from-bracket" />
        Sign Out
      </div>
    </aside>
  );
}
