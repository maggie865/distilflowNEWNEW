import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function RoleRoute({ allowedRoles, fallback = '/' }) {
  const { user } = useAuth();

  if (user && !allowedRoles.includes(user.role)) {
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}