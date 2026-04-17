import { Navigate, Route, Routes } from 'react-router-dom';

import AdminRoute from './components/guards/AdminRoute.jsx';
import GuestOnlyRoute from './components/guards/GuestOnlyRoute.jsx';
import ProtectedRoute from './components/guards/ProtectedRoute.jsx';

import AdminLayout from './layouts/AdminLayout.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import ChatLayout from './layouts/ChatLayout.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import SettingsLayout from './layouts/SettingsLayout.jsx';

import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';

import ChatPage from './pages/chat/ChatPage.jsx';
import EmptyChatPage from './pages/chat/EmptyChatPage.jsx';

import ProfilePage from './pages/profile/ProfilePage.jsx';

import NotificationsPage from './pages/notifications/NotificationsPage.jsx';

import AccountSettings from './pages/settings/AccountSettings.jsx';
import AppearanceSettings from './pages/settings/AppearanceSettings.jsx';
import BlockedUsersSettings from './pages/settings/BlockedUsersSettings.jsx';
import NotificationSettings from './pages/settings/NotificationSettings.jsx';
import PrivacySettings from './pages/settings/PrivacySettings.jsx';
import ProfileSettings from './pages/settings/ProfileSettings.jsx';

import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminMessages from './pages/admin/AdminMessages.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import AdminUserDetail from './pages/admin/AdminUserDetail.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';

import NotFoundPage from './pages/NotFoundPage.jsx';

/**
 * App — single source of truth for the URL space.
 *
 * Tree shape mirrors the Step 22 spec exactly:
 *
 *   Public (guest-only):
 *     /login, /register             → AuthLayout
 *
 *   Authenticated (chat surface — no navbar):
 *     /chat                         → EmptyChatPage
 *     /chat/:conversationId         → ChatPage
 *
 *   Authenticated (with navbar):
 *     /u/:username                  → ProfilePage
 *     /notifications                → NotificationsPage
 *     /settings/*                   → SettingsLayout
 *     /admin/*  (admin role only)   → AdminLayout
 *
 *   Catch-all:
 *     *                             → NotFoundPage
 *
 * Why nest layouts as routes (instead of wrapping each page):
 *   `<Outlet />` lets a single instance of (e.g.) `MainLayout` stay
 *   mounted while the user navigates between sub-pages. That keeps
 *   the navbar from re-rendering its dropdown state on every route
 *   change, and lets the chat sidebar persist its scroll position
 *   when switching between conversations.
 */
const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />

      <Route element={<GuestOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<ChatLayout />}>
          <Route path="/chat" element={<EmptyChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
        </Route>

        <Route element={<MainLayout />}>
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />

          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="account" element={<AccountSettings />} />
            <Route path="appearance" element={<AppearanceSettings />} />
            <Route path="notifications" element={<NotificationSettings />} />
            <Route path="privacy" element={<PrivacySettings />} />
            <Route path="blocked" element={<BlockedUsersSettings />} />
          </Route>
        </Route>
      </Route>

      <Route element={<AdminRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUserDetail />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="messages" element={<AdminMessages />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
