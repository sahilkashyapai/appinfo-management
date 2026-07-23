import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ApplyPage from './pages/ApplyPage';
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
import MyReportPage from './pages/MyReportPage';
import TeamAttendanceTodayPage from './pages/TeamAttendanceTodayPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import RegistrationsPage from './pages/RegistrationsPage';
import ProfilePage from './pages/ProfilePage';
import AttendancePage from './pages/AttendancePage';
import MessagesPage from './pages/MessagesPage';
import TimeTrackingPage from './pages/TimeTrackingPage';
import LeavePage from './pages/LeavePage';
import OrgChartPage from './pages/OrgChartPage';
import AssetsPage from './pages/AssetsPage';
import DocumentsPage from './pages/DocumentsPage';
import AdminsPage from './pages/AdminsPage';
import HiringPage from './pages/HiringPage';
import { ADMIN_ROLES, APPROVER_ROLES } from './utils/roles';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/apply" element={<ApplyPage />} />
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
        <Route path="attendance/today" element={<TeamAttendanceTodayPage />} />
        <Route path="birthdays" element={<BirthdaysPage />} />
        <Route path="anniversaries" element={<AnniversariesPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="wall" element={<WallPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="departments" element={<ProtectedRoute roles={ADMIN_ROLES}><DepartmentsPage /></ProtectedRoute>} />
        <Route path="holidays" element={<HolidaysPage />} />
        <Route path="reports" element={<ProtectedRoute roles={ADMIN_ROLES}><ReportsPage /></ProtectedRoute>} />
        <Route path="my-report" element={<MyReportPage />} />
        <Route path="audit" element={<ProtectedRoute roles={ADMIN_ROLES}><AuditPage /></ProtectedRoute>} />
        <Route path="time-tracking" element={<ProtectedRoute roles={ADMIN_ROLES}><TimeTrackingPage /></ProtectedRoute>} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="org-chart" element={<OrgChartPage />} />
        <Route path="assets" element={<ProtectedRoute roles={ADMIN_ROLES}><AssetsPage /></ProtectedRoute>} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="registrations" element={<ProtectedRoute roles={APPROVER_ROLES}><RegistrationsPage /></ProtectedRoute>} />
        <Route path="admins" element={<ProtectedRoute roles={ADMIN_ROLES}><AdminsPage /></ProtectedRoute>} />
        <Route path="hiring" element={<ProtectedRoute roles={APPROVER_ROLES}><HiringPage /></ProtectedRoute>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}
