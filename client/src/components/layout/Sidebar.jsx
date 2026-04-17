import { Link } from 'react-router-dom';
import { LogOut, MessageCircle, Search, Settings as SettingsIcon, User as UserIcon } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext.jsx';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import Avatar from '../common/Avatar.jsx';
import Badge from '../common/Badge.jsx';

/**
 * Sidebar — placeholder shell for the conversation list rendered by
 * `ChatLayout`.
 *
 * Step 25 replaces the inner content with the real searchable
 * conversation list (presence dots, unread per-chat badges, mute /
 * archive affordances). For now this only provides the chrome —
 * brand bar, current-user footer, notifications badge — so the chat
 * route renders cleanly and the layout proportions can be verified.
 */
const Sidebar = () => {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <aside className="flex h-full w-full flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {/* Brand / unread badge */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <Link
          to="/chat"
          className="flex items-center gap-2 text-brand-700 transition-opacity hover:opacity-80 dark:text-brand-300"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
            Chats
          </span>
        </Link>
        {unreadCount > 0 ? <Badge count={unreadCount} variant="danger" /> : null}
      </div>

      {/* Search placeholder */}
      <div className="px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            disabled
            placeholder="Search conversations…"
            className="w-full cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 py-1.5 pr-3 pl-8 text-sm text-gray-500 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          />
        </label>
      </div>

      {/* Conversation list slot — filled by Step 25 */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Conversation list coming soon
        </p>
      </div>

      {/* Current-user footer */}
      <div className="flex items-center gap-2 border-t border-gray-200 px-3 py-2 dark:border-gray-800">
        <Link
          to={user?.username ? `/u/${user.username}` : '/settings/profile'}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || user?.username}
            size="sm"
          />
          <span className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {user?.displayName || user?.username || 'You'}
          </span>
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <SettingsIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={() => logout()}
          aria-label="Log out"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
