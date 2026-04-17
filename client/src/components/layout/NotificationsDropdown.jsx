import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AtSign,
  Bell,
  CheckCheck,
  MessageSquare,
  ShieldAlert,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import Avatar from '../common/Avatar.jsx';
import Badge from '../common/Badge.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * NotificationsDropdown — bell button + dropdown panel mounted in the
 * navbar.
 *
 * Why a single component (vs. a separate `Bell` + a portal `Panel`):
 *   The trigger and the panel share the same `useOnClickOutside` ref,
 *   open state, and keyboard escape handler. Splitting them would only
 *   make the close-on-outside logic harder to reason about.
 *
 * Source navigation:
 *   Each notification carries a `conversationId` (chat-bound types).
 *   On click we route the user to `/chat/<id>` and call `markRead(id)`
 *   in parallel — the navigation itself is immediate, the optimistic
 *   markRead drops the unread badge so the user perceives one unified
 *   action ("open + read") without waiting for a server round-trip.
 *
 * Empty/auth states:
 *   The dropdown intentionally renders even with zero items, so the
 *   user gets a confirming "You're all caught up" rather than a
 *   silently dismissed click — small but important UX detail.
 *
 * SECURITY:
 *   `text` is server-generated and stored sanitized. We render it as
 *   plain text only (no `dangerouslySetInnerHTML`).
 */

const ICON_BY_TYPE = {
  message: MessageSquare,
  mention: AtSign,
  groupInvite: Users,
  adminAction: ShieldAlert,
};

const NotificationsDropdown = () => {
  const { unreadCount, notifications, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  const containerRef = useRef(null);
  useOnClickOutside(containerRef, () => setOpen(false));

  // Close on Escape — keeps parity with native menu behaviour.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Show at most 20 in the dropdown — the "View all" link is the
  // overflow path, not infinite scroll inside a popover.
  const recent = useMemo(() => notifications.slice(0, 20), [notifications]);

  const handleItemClick = (notification) => {
    setOpen(false);
    if (!notification?.isRead) {
      markRead(notification._id).catch(() => {
        /* The context already self-heals the badge on failure. */
      });
    }
    if (notification?.conversationId) {
      navigate(`/chat/${notification.conversationId}`);
    } else {
      navigate('/notifications');
    }
  };

  const handleMarkAll = async () => {
    if (busyAll || unreadCount === 0) return;
    setBusyAll(true);
    try {
      await markAllRead();
    } catch {
      toast.error('Could not mark all as read.');
    } finally {
      setBusyAll(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        className="relative rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5">
            <Badge count={unreadCount} variant="danger" />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 flex w-80 max-w-[calc(100vw-1rem)] origin-top-right flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Notifications
              </span>
              {unreadCount > 0 ? (
                <Badge count={unreadCount} variant="danger" />
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={busyAll || unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400 dark:hover:bg-brand-900/30"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mark all read</span>
            </button>
          </header>

          <ul className="max-h-96 overflow-y-auto">
            {recent.length === 0 ? (
              <li className="px-4 py-10 text-center text-xs text-gray-500 dark:text-gray-400">
                You&rsquo;re all caught up.
              </li>
            ) : (
              recent.map((notification) => (
                <li key={notification._id}>
                  <NotificationItem
                    notification={notification}
                    onSelect={() => handleItemClick(notification)}
                  />
                </li>
              ))
            )}
          </ul>

          <footer className="border-t border-gray-100 px-3 py-2 text-center dark:border-gray-800">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              View all notifications
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
};

const NotificationItem = ({ notification, onSelect }) => {
  const Icon = ICON_BY_TYPE[notification.type] ?? Bell;
  const actor = notification.actor;
  const actorName = actor?.displayName || actor?.username || 'Someone';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={clsx(
        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
        'hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:hover:bg-gray-800/60 dark:focus:bg-gray-800/60',
        !notification.isRead && 'bg-brand-50/50 dark:bg-brand-900/10',
      )}
    >
      <div className="relative">
        <Avatar src={actor?.avatarUrl} name={actorName} size="sm" />
        <span
          className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-brand-400 dark:ring-gray-700"
          aria-hidden="true"
        >
          <Icon className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">
          {actorName}
        </p>
        <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-300">
          {notification.text}
        </p>
        <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.isRead ? (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
          aria-label="Unread"
        />
      ) : null}
    </button>
  );
};

export default NotificationsDropdown;
