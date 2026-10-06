import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationPanel from './NotificationPanel';
import EmployeeDrawer from './EmployeeDrawer';
import RsvpModal from './RsvpModal';
import EmployeeFormModal from './EmployeeFormModal';
import ErrorBoundary from './ErrorBoundary';
import BankDetailsReminder from './BankDetailsReminder';
import { useDrawers } from '../context/DrawerContext';

export default function Layout() {
  const [npOpen, setNpOpen] = useState(false);
  const [sbOpen, setSbOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState(undefined); // undefined = closed, null = create, object = edit
  const { employeeId, rsvpEventId, closeEmployee, closeRsvp } = useDrawers();
  const { pathname } = useLocation();

  const overlayOn = npOpen || sbOpen || !!employeeId || !!rsvpEventId || editEmployee !== undefined;

  function closeAll() {
    setNpOpen(false);
    setSbOpen(false);
    closeEmployee();
    closeRsvp();
    setEditEmployee(undefined);
  }

  return (
    <div id="app" style={{ display: 'flex' }}>
      <Sidebar open={sbOpen} onNavigate={() => setSbOpen(false)} onOpenNotifications={() => setNpOpen(true)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header onToggleSidebar={() => setSbOpen((o) => !o)} onOpenNotifications={() => setNpOpen(true)} />
        <div id="content">
          {/* A crash in one page keeps the sidebar/header; navigating away recovers. */}
          <ErrorBoundary resetKey={pathname}>
            <Outlet context={{ openEditEmployee: setEditEmployee }} />
          </ErrorBoundary>
        </div>
      </div>

      <NotificationPanel open={npOpen} onClose={() => setNpOpen(false)} />
      <EmployeeDrawer onEdit={setEditEmployee} />
      <RsvpModal />
      <BankDetailsReminder />
      {editEmployee !== undefined && <EmployeeFormModal employee={editEmployee} onClose={() => setEditEmployee(undefined)} />}

      <div id="overlay" className={overlayOn ? 'show' : ''} onClick={closeAll} />
    </div>
  );
}
