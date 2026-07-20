import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import BirthdaysPage from './pages/BirthdaysPage';
import AnniversariesPage from './pages/AnniversariesPage';
import EventsPage from './pages/EventsPage';
import WallPage from './pages/WallPage';
import CalendarPage from './pages/CalendarPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import DepartmentsPage from './pages/DepartmentsPage';
import HolidaysPage from './pages/HolidaysPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import RegistrationsPage from './pages/RegistrationsPage';
import ProfilePage from './pages/ProfilePage';
import AttendancePage from './pages/AttendancePage';
import MessagesPage from './pages/MessagesPage';
import { ADMIN_ROLES, APPROVER_ROLES } from './utils/roles';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="birthdays" element={<BirthdaysPage />} />
        <Route path="anniversaries" element={<AnniversariesPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="wall" element={<WallPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="departments" element={<ProtectedRoute roles={ADMIN_ROLES}><DepartmentsPage /></ProtectedRoute>} />
        <Route path="holidays" element={<ProtectedRoute roles={ADMIN_ROLES}><HolidaysPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute roles={ADMIN_ROLES}><ReportsPage /></ProtectedRoute>} />
        <Route path="audit" element={<ProtectedRoute roles={ADMIN_ROLES}><AuditPage /></ProtectedRoute>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="registrations" element={<ProtectedRoute roles={APPROVER_ROLES}><RegistrationsPage /></ProtectedRoute>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}
