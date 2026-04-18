import { Link, Outlet } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';

import Footer from '../components/common/Footer.jsx';

/**
 * AuthLayout — chrome-less, centered shell for sign-in / sign-up.
 *
 * No `Navbar` here on purpose: the navbar's primary actions
 * (notifications, profile, settings) are meaningless to a guest, and
 * showing them invites confusion. The brand link doubles as the only
 * navigation affordance.
 *
 * The gradient + min-h-screen pattern keeps the card visually centered
 * even when the form grows (inline validation messages, password
 * confirmation field, etc.) without any JS measurement.
 */
const AuthLayout = () => {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-linear-to-br from-brand-50 via-white to-brand-100 px-4 py-10 dark:from-gray-950 dark:via-gray-950 dark:to-brand-950/40">
      {/* Decorative orbs — purely visual, hidden from AT */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-300/30 blur-3xl dark:bg-brand-700/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl dark:bg-brand-600/20"
      />

      <Link
        to="/chat"
        className="relative z-10 mb-6 flex items-center gap-2 text-brand-700 transition-opacity hover:opacity-80 dark:text-brand-300"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
          Chat App
        </span>
      </Link>

      <main className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-xl backdrop-blur sm:p-8 dark:border-gray-800 dark:bg-gray-900/80">
          <Outlet />
        </div>
      </main>

      <Footer className="relative z-10 mt-6 border-0 bg-transparent backdrop-blur-0 dark:bg-transparent" />
    </div>
  );
};

export default AuthLayout;
