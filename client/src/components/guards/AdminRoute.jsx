import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext.jsx';
import Spinner from '../common/Spinner.jsx';

/**
 * AdminRoute — superset of ProtectedRoute that also requires the
 * `admin` role.
 *
 * Defence-in-depth note: the server enforces admin authorisation on
 * every `/admin/*` REST endpoint. This guard exists purely for UX so
 * non-admins don't see admin URLs render and immediately error out.
 * It is NOT the source of truth for permission.
 *
 * Non-admins are bounced to `/chat` rather than `/login` because they
 * are perfectly authorised to use the rest of the app — only the
 * admin surface is off-limits.
 */
const AdminRoute = () => {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner fullPage size="lg" />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  if (!isAdmin) {
    return <Navigate to="/chat" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;
