import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { SocketProvider } from './contexts/SocketContext.jsx';
import { PreferencesProvider } from './contexts/PreferencesContext.jsx';
import { NotificationProvider } from './contexts/NotificationContext.jsx';

import './index.css';

/**
 * Provider order matters and is enforced here:
 *
 *   BrowserRouter           — `useNavigate`, `useLocation` etc.
 *     └─ AuthProvider       — owns `token` + `user`; calls navigate()
 *         └─ SocketProvider — depends on token; tears down on logout
 *             └─ PreferencesProvider — depends on user (for prefs)
 *                 └─ NotificationProvider — depends on auth+socket+prefs
 *
 * Anything that needs the router MUST sit inside `<BrowserRouter>`,
 * which is why the auth provider (which calls `navigate('/chat')`
 * after a successful login) cannot live above it.
 *
 * Toaster sits at the leaf so toast portals are torn down after the
 * provider tree on hot-reload — preventing duplicate toasters in dev.
 */

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <PreferencesProvider>
            <NotificationProvider>
              <App />
              <Toaster
                position="top-right"
                gutter={8}
                toastOptions={{
                  duration: 4000,
                  className:
                    '!bg-white !text-gray-900 dark:!bg-gray-900 dark:!text-gray-100 !shadow-lg !rounded-lg !border !border-gray-200 dark:!border-gray-800',
                }}
              />
            </NotificationProvider>
          </PreferencesProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
