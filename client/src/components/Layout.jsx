import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationPanel from './NotificationPanel';
import EmployeeDrawer from './EmployeeDrawer';
import RsvpModal from './RsvpModal';
import EmployeeFormModal from './EmployeeFormModal';
import { useDrawers } from '../context/DrawerContext';

export default function Layout() {
  const [npOpen, setNpOpen] = useState(false);
  const [sbOpen, setSbOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState(undefined); // undefined = closed, null = create, object = edit
  const { employeeId, rsvpEventId, closeEmployee, closeRsvp } = useDrawers();

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
          <Outlet context={{ openEditEmployee: setEditEmployee }} />
        </div>
      </div>

      <NotificationPanel open={npOpen} onClose={() => setNpOpen(false)} />
      <EmployeeDrawer onEdit={setEditEmployee} />
      <RsvpModal />
      {editEmployee !== undefined && <EmployeeFormModal employee={editEmployee} onClose={() => setEditEmployee(undefined)} />}

      <div id="overlay" className={overlayOn ? 'show' : ''} onClick={closeAll} />
    </div>
  );
}
