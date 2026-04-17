import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';

import Avatar from '../../components/common/Avatar.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { getBlockedUsers, unblockUser } from '../../api/user.service.js';

/**
 * BlockedUsersSettings — list of users the viewer has blocked, with an
 * inline Unblock action.
 *
 * Privacy contract:
 *   - We deliberately render only the safe public fields the server
 *     ships in `getBlockedUsers` (avatar, display name, @username) and
 *     never any PII (email, last seen). Even if the server response
 *     started shipping more in the future, this page is a hard gate.
 *
 * Optimistic UX:
 *   - Unblocking flips the row out of state immediately and updates
 *     the AuthContext mirror so other surfaces (search, profile page)
 *     reflect the change without a refetch. On failure we re-fetch to
 *     repair drift instead of trying to manually re-insert the row in
 *     its original sort position.
 */

const BlockedUsersSettings = () => {
  const { updateUser } = useAuth();

  const [state, setState] = useState({
    loading: true,
    error: null,
    users: [],
  });
  const [unblockingId, setUnblockingId] = useState(null);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await getBlockedUsers();
      setState({
        loading: false,
        error: null,
        users: result?.data?.users ?? [],
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Failed to load blocked users.';
      setState({ loading: false, error: message, users: [] });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUnblock = async (target) => {
    if (!target?._id || unblockingId) return;
    setUnblockingId(String(target._id));

    /* Optimistic remove + AuthContext mirror update. */
    setState((prev) => ({
      ...prev,
      users: prev.users.filter((u) => String(u._id) !== String(target._id)),
    }));
    updateUser((prev) => {
      const next = { ...prev };
      const current = Array.isArray(prev.blockedUsers) ? prev.blockedUsers : [];
      next.blockedUsers = current.filter((entry) => {
        const id = entry?.user?._id ?? entry?.user ?? entry;
        return String(id) !== String(target._id);
      });
      return next;
    });

    try {
      await unblockUser(target._id);
      toast.success(`${target.displayName || target.username} unblocked.`);
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Could not unblock user.';
      toast.error(message);
      refresh();
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Blocked users
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          People you&apos;ve blocked can&apos;t message you. They aren&apos;t notified.
        </p>
      </header>

      {state.loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : state.error ? (
        <EmptyState
          icon={ShieldOff}
          title="Couldn't load list"
          description={state.error}
          action={
            <button
              type="button"
              onClick={refresh}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Try again
            </button>
          }
        />
      ) : state.users.length === 0 ? (
        <EmptyState
          icon={ShieldOff}
          title="You haven't blocked anyone"
          description="When you block someone, they'll show up here."
        />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {state.users.map((target) => {
            const isBusy = unblockingId === String(target._id);
            return (
              <li
                key={target._id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <Link
                  to={`/u/${target.username}`}
                  className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-90"
                >
                  <Avatar
                    src={target.avatarUrl}
                    name={target.displayName || target.username}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {target.displayName || target.username}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      @{target.username}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnblock(target)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {isBusy ? <Spinner size="sm" /> : <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>Unblock</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default BlockedUsersSettings;
