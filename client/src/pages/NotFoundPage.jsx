import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * NotFoundPage — terminal `*` route. Renders standalone (no layout)
 * so it's safe to land on regardless of auth state: a guest hitting
 * a stale deep link gets a useful page instead of a routing error.
 */
const NotFoundPage = () => (
  <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
    <div className="max-w-md text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-300">
        404
      </p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        The page you’re looking for doesn’t exist or has been moved.
      </p>
      <Link
        to="/chat"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
      >
        Back to chat
      </Link>
    </div>
  </main>
);

export default NotFoundPage;
