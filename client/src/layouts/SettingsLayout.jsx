import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Lock,
  Palette,
  ShieldOff,
  User as UserIcon,
  UserCog,
} from 'lucide-react';
import clsx from 'clsx';

/**
 * SettingsLayout — left sub-nav (desktop) / dropdown (mobile) for the
 * `/settings/*` tree.
 *
 * Why a dropdown on mobile rather than tabs:
 *   The settings catalogue has six entries and is expected to grow.
 *   Horizontal tabs at small widths force constant horizontal scroll
 *   and hide the active section; a single `<select>` keeps the
 *   current section visible at a glance and avoids the off-screen
 *   overflow problem entirely.
 */

const NAV_ITEMS = [
  { to: '/settings/profile', label: 'Profile', icon: UserIcon },
  { to: '/settings/account', label: 'Account', icon: UserCog },
  { to: '/settings/appearance', label: 'Appearance', icon: Palette },
  { to: '/settings/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings/privacy', label: 'Privacy', icon: Lock },
  { to: '/settings/blocked', label: 'Blocked Users', icon: ShieldOff },
];

const linkClass = ({ isActive }) =>
  clsx(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
  );

const SettingsLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:gap-8 md:py-8">
      <header className="md:hidden">
        <h1 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
          Settings
        </h1>
        <label className="block">
          <span className="sr-only">Settings section</span>
          <select
            value={location.pathname}
            onChange={(event) => navigate(event.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {NAV_ITEMS.map(({ to, label }) => (
              <option key={to} value={to}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <aside className="hidden w-56 shrink-0 md:block">
        <h1 className="mb-3 px-3 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
          Settings
        </h1>
        <nav aria-label="Settings sections" className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
          <Outlet />
        </div>
      </section>
    </div>
  );
};

export default SettingsLayout;
