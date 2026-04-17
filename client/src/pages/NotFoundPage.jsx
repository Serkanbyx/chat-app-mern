import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, MessageCircle, MessagesSquare } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext.jsx';
import { ROUTES } from '../utils/constants.js';

/**
 * NotFoundPage — terminal `*` route.
 *
 * Why we render it standalone (no layout):
 *   The `*` route fires for arbitrary URLs, including ones a guest
 *   reached via a stale deep-link. Forcing the user through the chat
 *   layout would mean rendering a sidebar that makes no sense in the
 *   guest context. A standalone screen is safe in both auth states.
 *
 * Auth-aware CTA:
 *   - Authed users get "Back to chat" so the recovery click drops them
 *     straight into the surface they were trying to reach.
 *   - Guests get "Go to sign in" — sending them to `/chat` would just
 *     bounce off `ProtectedRoute` and confuse the cause of the redirect.
 *
 * SECURITY:
 *   - The page never reflects the requested URL back to the user.
 *     Echoing `location.pathname` would let an attacker craft a link
 *     containing arbitrary text that renders as part of "our" UI
 *     (think phishing prompts).
 *   - The same component is returned for every unknown URL — including
 *     `/admin/<anything>` for non-admins. The server is the source of
 *     truth on whether a route exists; the client must not leak that
 *     `/admin/secret-thing` "would have" been a real page for an admin.
 */

const ILLUSTRATION_BUBBLES = [
  { id: 'a', side: 'left', dx: 'left-3', dy: 'top-2', size: 'h-7 w-12' },
  { id: 'b', side: 'right', dx: 'right-2', dy: 'top-10', size: 'h-6 w-16' },
  { id: 'c', side: 'left', dx: 'left-6', dy: 'bottom-2', size: 'h-5 w-10' },
];

const NotFoundPage = () => {
  const { isAuthenticated } = useAuth();

  const ctaTo = isAuthenticated ? ROUTES.CHAT : ROUTES.LOGIN;
  const ctaLabel = isAuthenticated ? 'Back to chat' : 'Go to sign in';
  const CtaIcon = isAuthenticated ? MessageCircle : ArrowLeft;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md text-center">
        <div
          aria-hidden="true"
          className="relative mx-auto mb-6 h-32 w-32"
        >
          <div className="absolute inset-0 rounded-full bg-brand-500/10 blur-xl dark:bg-brand-400/10" />
          <div className="relative flex h-full w-full items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
            <MessagesSquare
              className="h-12 w-12 text-brand-600 dark:text-brand-300"
            />
            {ILLUSTRATION_BUBBLES.map((bubble) => (
              <span
                key={bubble.id}
                className={[
                  'absolute rounded-full bg-brand-100 ring-1 ring-brand-200 dark:bg-brand-900/50 dark:ring-brand-800/60',
                  bubble.dx,
                  bubble.dy,
                  bubble.size,
                ].join(' ')}
              />
            ))}
            <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2 ring-white dark:ring-gray-900">
              <Compass className="h-4 w-4" />
            </span>
          </div>
        </div>

        <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-300">
          404
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          The page you’re looking for doesn’t exist, was moved, or you
          may not have access to it.
        </p>

        <Link
          to={ctaTo}
          replace
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
        >
          <CtaIcon className="h-4 w-4" aria-hidden="true" />
          <span>{ctaLabel}</span>
        </Link>
      </div>
    </main>
  );
};

export default NotFoundPage;
