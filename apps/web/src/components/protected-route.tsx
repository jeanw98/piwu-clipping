import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-grain text-mist">
        Loading session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
}
