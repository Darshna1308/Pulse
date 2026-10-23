import { useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner label="Restoring your session" />;
  if (status === 'anonymous') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}

/**
 * Signed-in users skip the login and registration pages. A user who signs in
 * on one of these pages is redirected by the page itself (to ?next= or the
 * demo flow), so the redirect here only applies to sessions that already
 * existed when the page was opened.
 */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  const sawAnonymous = useRef(false);
  if (status === 'anonymous') sawAnonymous.current = true;
  if (status === 'loading') return <FullPageSpinner label="Loading" dark />;
  if (status === 'authenticated' && !sawAnonymous.current) return <Navigate to="/app" replace />;
  return <Outlet />;
}
