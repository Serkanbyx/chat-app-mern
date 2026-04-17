import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

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
 * admin surface is off-limits. We surface a toast on the bounce so
 * the user understands why the URL they clicked failed silently
 * (otherwise an admin deep-link from chat looks like a broken link).
 *
 * SECURITY:
 *   The toast copy says "Admin access required" — it intentionally
 *   does NOT confirm whether the requested admin route actually
 *   exists. Echoing pathname back ("`/admin/secret-thing` requires
 *   admin") would let a non-admin enumerate the admin surface.
 */
const ADMIN_TOAST_ID = 'admin-access-required';

const AdminRoute = () => {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  /* Toast fires once when a signed-in non-admin lands here. The fixed
   * `id` collapses React 18 strict-mode double-fires into a single
   * notification. */
  const shouldDenyAdmin = !loading && isAuthenticated && !isAdmin;
  useEffect(() => {
    if (!shouldDenyAdmin) return;
    toast.error('Admin access required', { id: ADMIN_TOAST_ID });
  }, [shouldDenyAdmin]);

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
