import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext.jsx';
import Spinner from '../common/Spinner.jsx';

/**
 * ProtectedRoute — gate for any URL that requires an authenticated
 * session.
 *
 * Why we wait on `loading` instead of falling through:
 *   On a hard refresh, AuthContext fires `/auth/me` to validate the
 *   stored JWT. During those few hundred milliseconds `isAuthenticated`
 *   is `false` even when the user is actually logged in. Without this
 *   gate the user would briefly see `/login` flash before being bounced
 *   back to `/chat` — a "flash of guest content" that breaks trust.
 *
 * The guard is server-state-driven (it trusts `isAuthenticated`, which
 * only flips to true after `/auth/me` succeeds), not localStorage-
 * driven. A revoked token therefore cannot smuggle a user past the
 * guard just because the token string is still on disk.
 *
 * `state={{ from }}` lets the login page redirect the user back to the
 * URL they originally requested after they sign in.
 */
const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();
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

  return <Outlet />;
};

export default ProtectedRoute;
