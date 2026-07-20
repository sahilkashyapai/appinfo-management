import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import GlobalSearch from './GlobalSearch';
import Avatar from './Avatar';

const TITLES = {
  '/': 'Dashboard',
  '/employees': 'Employees',
  '/birthdays': 'Birthday Management',
  '/anniversaries': 'Work Anniversaries',
  '/events': 'Events',
  '/wall': 'Celebration Wall',
  '/calendar': 'Calendar',
  '/announcements': 'Announcements',
  '/departments': 'Departments',
  '/holidays': 'Holidays',
  '/reports': 'Reports & Analytics',
  '/audit': 'Audit Logs',
  '/settings': 'Settings',
  '/registrations': 'Employee Registrations',
  '/profile': 'My Profile',
};

export default function Header({ onToggleSidebar, onOpenNotifications }) {
  const { pathname } = useLocation();
  const { dark, toggleDark } = useTheme();
  const { user } = useAuth();
  const { data: notifs = [] } = useNotifications();
  const unread = notifs.filter((n) => n.unread).length;
  const navigate = useNavigate();

  return (
    <header id="hdr">
      <div className="hbtn hb-menu" onClick={onToggleSidebar}>
        <i className="fa-solid fa-bars" />
      </div>
      <div className="hbc">
        <span className="hr">AII</span>
        <i className="fa-solid fa-chevron-right" />
        <span className="hcur">{TITLES[pathname] || 'AII Celebrations'}</span>
      </div>
      <GlobalSearch />
      <div className="hbtn" onClick={onOpenNotifications}>
        <i className="fa-solid fa-bell" />
        {unread > 0 && <div className="ndot" />}
      </div>
      <div className="hbtn" onClick={toggleDark}>
        <i className={`fa-solid ${dark ? 'fa-sun' : 'fa-moon'}`} />
      </div>
      <div className="hbtn" onClick={() => navigate('/settings')}>
        <i className="fa-solid fa-gear" />
      </div>
      <Avatar name={user?.name} index={user?.avatarIndex} src={user?.avatarUrl} size={34} onClick={() => navigate('/profile')} style={{ border: '2px solid var(--bg2)' }} />
    </header>
  );
}
