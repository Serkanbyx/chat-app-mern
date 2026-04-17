import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AtSign,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

import Avatar from '../../components/common/Avatar.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { listNotifications } from '../../api/notification.service.js';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * NotificationsPage — full inbox view at `/notifications`.
 *
 * Why a dedicated page (the dropdown already shows recent items):
 *   - The dropdown is a 20-item ring buffer; it cannot show history
 *     beyond the current session window. The page is the source of
 *     truth and uses the paginated REST endpoint.
 *   - Filters (`all`/`unread`) are page-only — they would clutter the
 *     dropdown which is intentionally a quick-glance surface.
 *
 * The page is read-mostly (we don't optimistically reorder rows when a
 * new socket event arrives — that would be jarring while the user is
 * scanning). Instead, the global unread badge updates in real time and
 * the user can hit "Refresh" to pull the latest page.
 *
 * SECURITY:
 *   - Notification text is server-generated and stored sanitized.
 *   - Navigation only ever uses internal React Router paths derived
 *     from `conversationId`; we never follow URLs from the notification
 *     payload.
 */

const PAGE_SIZE = 20;

const ICON_BY_TYPE = {
  message: MessageSquare,
  mention: AtSign,
  groupInvite: Users,
  adminAction: ShieldAlert,
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
];

const NotificationsPage = () => {
  const { markRead, markAllRead, dismiss, unreadCount } = useNotifications();
  const navigate = useNavigate();

  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({
    loading: true,
    error: null,
    items: [],
    totalPages: 1,
    total: 0,
  });
  const [busyAll, setBusyAll] = useState(false);
  const [pendingId, setPendingId] = useState(null);

  const fetchPage = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await listNotifications({ page, limit: PAGE_SIZE });
      const data = result?.data ?? {};
      setState({
        loading: false,
        error: null,
        items: data.items ?? [],
        totalPages: data.totalPages ?? 1,
        total: data.total ?? 0,
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Failed to load notifications.';
      setState({
        loading: false,
        error: message,
        items: [],
        totalPages: 1,
        total: 0,
      });
    }
  }, [page]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const filtered = useMemo(() => {
    if (filter === 'unread') return state.items.filter((n) => !n.isRead);
    return state.items;
  }, [filter, state.items]);

  const handleOpen = async (notification) => {
    if (!notification.isRead) {
      // Optimistically reflect the read state on this page too — the
      // shared context already updates the badge.
      setState((prev) => ({
        ...prev,
        items: prev.items.map((n) =>
          n._id === notification._id ? { ...n, isRead: true } : n,
        ),
      }));
      markRead(notification._id).catch(() => {
        /* Context self-heals; revert local row to keep UI honest. */
        setState((prev) => ({
          ...prev,
          items: prev.items.map((n) =>
            n._id === notification._id ? { ...n, isRead: false } : n,
          ),
        }));
      });
    }
    if (notification.conversationId) {
      navigate(`/chat/${notification.conversationId}`);
    }
  };

  const handleMarkAll = async () => {
    if (busyAll || unreadCount === 0) return;
    setBusyAll(true);
    try {
      await markAllRead();
      setState((prev) => ({
        ...prev,
        items: prev.items.map((n) => ({ ...n, isRead: true })),
      }));
    } catch {
      toast.error('Could not mark all as read.');
    } finally {
      setBusyAll(false);
    }
  };

  const handleDismiss = async (notification) => {
    if (pendingId) return;
    setPendingId(notification._id);
    try {
      await dismiss(notification._id);
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((n) => n._id !== notification._id),
        total: Math.max(0, prev.total - 1),
      }));
    } catch {
      toast.error('Could not dismiss notification.');
    } finally {
      setPendingId(null);
    }
  };

  const goToPage = (next) => {
    if (next < 1 || next > state.totalPages || next === page) return;
    setPage(next);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {state.total} total &middot; {unreadCount} unread
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Filter notifications"
            className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={clsx(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  filter === f.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={busyAll || unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Mark all read</span>
          </button>
        </div>
      </header>

      {state.loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : state.error ? (
        <EmptyState
          icon={Bell}
          title="Couldn't load notifications"
          description={state.error}
          action={
            <button
              type="button"
              onClick={fetchPage}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Try again
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? "You're all caught up."
              : 'You will see new mentions, messages and admin updates here.'
          }
          action={
            <Link
              to="/chat"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Go to chat
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {filtered.map((notification) => (
            <NotificationRow
              key={notification._id}
              notification={notification}
              onOpen={() => handleOpen(notification)}
              onDismiss={() => handleDismiss(notification)}
              dismissing={pendingId === notification._id}
            />
          ))}
        </ul>
      )}

      {state.totalPages > 1 ? (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between text-sm"
        >
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Previous</span>
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} of {state.totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= state.totalPages}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </div>
  );
};

const NotificationRow = ({ notification, onOpen, onDismiss, dismissing }) => {
  const Icon = ICON_BY_TYPE[notification.type] ?? Bell;
  const actor = notification.actor;
  const actorName = actor?.displayName || actor?.username || 'Someone';

  return (
    <li
      className={clsx(
        'flex items-start gap-3 px-4 py-3 transition-colors',
        !notification.isRead && 'bg-brand-50/50 dark:bg-brand-900/10',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <div className="relative">
          <Avatar src={actor?.avatarUrl} name={actorName} size="md" />
          <span
            className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-brand-400 dark:ring-gray-700"
            aria-hidden="true"
          >
            <Icon className="h-3 w-3" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {actorName}
            </p>
            {!notification.isRead ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-brand-500"
                aria-label="Unread"
              />
            ) : null}
          </div>
          <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
            {notification.text}
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        disabled={dismissing}
        aria-label="Dismiss notification"
        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
      >
        {dismissing ? (
          <Spinner size="sm" />
        ) : (
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </li>
  );
};

export default NotificationsPage;
