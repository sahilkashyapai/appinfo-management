import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Proadmin has every permission an admin/superadmin has (see utils/roles.js),
  // regardless of which roles a given route was written to require.
  if (user.role !== 'proadmin' && roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
