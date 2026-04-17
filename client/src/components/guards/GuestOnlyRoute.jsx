import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext.jsx';
import Spinner from '../common/Spinner.jsx';

/**
 * GuestOnlyRoute — inverse of ProtectedRoute.
 *
 * Wraps `/login` and `/register`. If the user is already authenticated
 * we redirect to `/chat` so they don't see auth forms in a logged-in
 * state (which would be confusing and lets them re-submit credentials
 * unnecessarily).
 *
 * We still wait on `loading` so a hard refresh on `/login` with a
 * valid token doesn't briefly render the form before bouncing.
 */
const GuestOnlyRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Spinner fullPage size="lg" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  return <Outlet />;
};

export default GuestOnlyRoute;
