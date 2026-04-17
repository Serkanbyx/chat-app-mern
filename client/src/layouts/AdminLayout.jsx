import { NavLink, Outlet } from 'react-router-dom';
import { Flag, LayoutDashboard, MessagesSquare, Users } from 'lucide-react';
import clsx from 'clsx';

/**
 * AdminLayout — wraps every `/admin/*` page in a moderator workspace.
 *
 * Desktop: vertical sidebar on the left with the four admin sections.
 * Mobile: sidebar collapses to a horizontally-scrollable tab bar at
 *         the top so the same routes remain reachable without giving
 *         up vertical real-estate to a permanent drawer.
 *
 * The container keeps the underlying `MainLayout` navbar visible
 * (this layout sits inside `MainLayout`), giving moderators one click
 * back to the chat surface or notifications at any time.
 */

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/reports', label: 'Reports', icon: Flag },
  { to: '/admin/messages', label: 'Messages', icon: MessagesSquare },
];

const desktopLinkClass = ({ isActive }) =>
  clsx(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
  );

const tabLinkClass = ({ isActive }) =>
  clsx(
    'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
      : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white',
  );

const AdminLayout = () => {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:gap-6 md:py-6">
      {/* Mobile tab bar */}
      <nav
        aria-label="Admin sections (mobile)"
        className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto border-b border-gray-200 px-4 md:hidden dark:border-gray-800"
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={tabLinkClass}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 md:block">
        <nav aria-label="Admin sections" className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={desktopLinkClass}>
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

export default AdminLayout;
