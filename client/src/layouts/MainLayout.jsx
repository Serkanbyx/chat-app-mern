import { Outlet } from 'react-router-dom';

import Navbar from '../components/layout/Navbar.jsx';
import Footer from '../components/common/Footer.jsx';

/**
 * MainLayout — generic authenticated shell used by everything except
 * the chat surface (which has its own bespoke layout) and the auth
 * flow (which uses `AuthLayout`).
 *
 * Concretely this wraps:
 *   - Profile page   (`/u/:username`)
 *   - Settings tree  (`/settings/*` — itself wrapped in `SettingsLayout`)
 *   - Admin tree     (`/admin/*`    — itself wrapped in `AdminLayout`)
 *
 * Keeping the navbar mounted here (not at the route tree root) means
 * `/login` and `/chat` can deliberately render without it, while every
 * sub-page automatically inherits the global navigation chrome.
 */
const MainLayout = () => {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
