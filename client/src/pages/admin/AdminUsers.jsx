import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmModal from '../../components/common/ConfirmModal.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import UserRow from '../../components/admin/UserRow.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import {
  deleteUser,
  listUsers,
  updateUserRole,
  updateUserStatus,
} from '../../api/admin.service.js';

/**
 * AdminUsers — paginated, filterable user-management table.
 *
 * Filter design:
 *   - `q` is debounced (300 ms) so a fast typer doesn't fire one HTTP
 *     call per keystroke. Page resets to 1 on filter change so the user
 *     never lands on an empty page after narrowing the result set.
 *   - Status / role are committed instantly because they're discrete
 *     selects — there's no value in waiting for a debounce.
 *
 * Action contract (mirrors the server):
 *   - Suspend / reinstate toggle — gated client-side AND server-side
 *     (admin self-protection, admin-target protection).
 *   - Role toggle — same self-protection. Last-admin protection is
 *     enforced server-side (HTTP 403); the toast surfaces the message.
 *   - Delete — irreversible cascade (avatar + messages anonymised,
 *     conversations pulled). Always passes through `ConfirmModal`.
 *
 * `pendingActionByUser` is a `Map` so multiple users can be in flight
 * simultaneously (rare, but happens when an admin batches actions).
 * Lookup stays O(1) without a per-user re-render fan-out.
 */

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deleted', label: 'Deleted' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const initialState = {
  loading: true,
  error: null,
  users: [],
  page: 1,
  totalPages: 1,
  total: 0,
};

const AdminUsers = () => {
  const { user: currentUser } = useAuth();

  const [filters, setFilters] = useState({ q: '', status: '', role: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState(initialState);

  const debouncedQ = useDebounce(filters.q.trim(), 300);

  /* `pendingActionByUser` maps userId → { action, intent? } so a row
   * knows whether ITS specific action is in flight. Using a `Map`
   * (not a plain object) keeps the React state a stable reference per
   * row even when other rows mutate the same map. */
  const [pendingActionByUser, setPendingActionByUser] = useState(() => new Map());
  const [confirm, setConfirm] = useState(null);

  /* Reset to page 1 whenever any filter changes — otherwise narrowing
   * "users" → "admins" with 200 results on page 5 would show empty. */
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filters.status, filters.role]);

  const fetchUsers = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await listUsers({
        q: debouncedQ || undefined,
        status: filters.status || undefined,
        role: filters.role || undefined,
        page,
        limit: PAGE_SIZE,
      });
      const data = result?.data ?? {};
      setState({
        loading: false,
        error: null,
        users: data.users ?? [],
        page: data.page ?? page,
        totalPages: data.totalPages ?? 1,
        total: data.total ?? 0,
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Failed to load users.';
      setState({ ...initialState, loading: false, error: message });
    }
  }, [debouncedQ, filters.status, filters.role, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ---------- Per-row action helpers ---------- */

  const setPending = useCallback((userId, action) => {
    setPendingActionByUser((prev) => {
      const next = new Map(prev);
      if (action) next.set(userId, action);
      else next.delete(userId);
      return next;
    });
  }, []);

  const applyUserPatch = useCallback((userId, patch) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u._id === userId ? { ...u, ...patch } : u)),
    }));
  }, []);

  const handleSuspendToggle = useCallback(
    (target) => {
      const nextStatus = target.status === 'suspended' ? 'active' : 'suspended';
      const isSuspending = nextStatus === 'suspended';
      setConfirm({
        title: isSuspending ? 'Suspend user?' : 'Reinstate user?',
        body: isSuspending
          ? `@${target.username} will lose access immediately and every active session will be disconnected.`
          : `@${target.username} will regain access and be able to sign in again.`,
        confirmLabel: isSuspending ? 'Suspend' : 'Reinstate',
        variant: isSuspending ? 'danger' : 'primary',
        onConfirm: async () => {
          setPending(target._id, 'status');
          try {
            const result = await updateUserStatus(target._id, {
              status: nextStatus,
            });
            applyUserPatch(target._id, {
              status: result?.data?.status ?? nextStatus,
            });
            toast.success(
              isSuspending
                ? `Suspended @${target.username}`
                : `Reinstated @${target.username}`,
            );
            setConfirm(null);
          } catch (err) {
            const message =
              err?.response?.data?.message ||
              'Could not update user status.';
            toast.error(message);
            throw err;
          } finally {
            setPending(target._id, null);
          }
        },
      });
    },
    [applyUserPatch, setPending],
  );

  const handleRoleToggle = useCallback(
    (target) => {
      const nextRole = target.role === 'admin' ? 'user' : 'admin';
      const isPromoting = nextRole === 'admin';
      setConfirm({
        title: isPromoting ? 'Promote to admin?' : 'Demote to user?',
        body: isPromoting
          ? `@${target.username} will gain access to every admin tool, including this panel. Admins cannot be moderated by other admins.`
          : `@${target.username} will lose admin privileges. They will keep their account and chat history.`,
        confirmLabel: isPromoting ? 'Promote' : 'Demote',
        variant: isPromoting ? 'primary' : 'danger',
        onConfirm: async () => {
          setPending(target._id, 'role');
          try {
            const result = await updateUserRole(target._id, nextRole);
            applyUserPatch(target._id, {
              role: result?.data?.role ?? nextRole,
            });
            toast.success(
              isPromoting
                ? `@${target.username} promoted to admin`
                : `@${target.username} demoted to user`,
            );
            setConfirm(null);
          } catch (err) {
            const message =
              err?.response?.data?.message || 'Could not update role.';
            toast.error(message);
            throw err;
          } finally {
            setPending(target._id, null);
          }
        },
      });
    },
    [applyUserPatch, setPending],
  );

  const handleDelete = useCallback(
    (target) => {
      setConfirm({
        title: 'Delete this account?',
        body: (
          <>
            <p>
              <span className="font-semibold text-gray-900 dark:text-white">
                @{target.username}
              </span>{' '}
              will be permanently deleted. This is irreversible.
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Their messages will be anonymised, conversations updated,
              and the avatar removed from storage.
            </p>
          </>
        ),
        confirmLabel: 'Delete forever',
        variant: 'danger',
        onConfirm: async () => {
          setPending(target._id, 'delete');
          try {
            await deleteUser(target._id);
            setState((prev) => ({
              ...prev,
              users: prev.users.filter((u) => u._id !== target._id),
              total: Math.max(0, prev.total - 1),
            }));
            toast.success(`Deleted @${target.username}`);
            setConfirm(null);
          } catch (err) {
            const message =
              err?.response?.data?.message || 'Could not delete user.';
            toast.error(message);
            throw err;
          } finally {
            setPending(target._id, null);
          }
        },
      });
    },
    [setPending],
  );

  /* ---------- Derived ---------- */

  const summary = useMemo(() => {
    if (state.loading) return 'Loading users…';
    if (state.total === 0) return 'No users match these filters.';
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, state.total);
    return `Showing ${start}–${end} of ${state.total}`;
  }, [page, state.loading, state.total]);

  const goToPage = (next) => {
    if (next < 1 || next > state.totalPages || next === page) return;
    setPage(next);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            User management
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {summary}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchUsers}
          disabled={state.loading}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Refresh</span>
        </button>
      </header>

      <section
        aria-label="Filters"
        className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-[1fr_auto_auto] dark:border-gray-800 dark:bg-gray-900/40"
      >
        <label className="relative">
          <span className="sr-only">Search users</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.q}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, q: event.target.value }))
            }
            placeholder="Search by name, username or email…"
            maxLength={60}
            className="block w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
          {filters.q ? (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, q: '' }))}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, status: event.target.value }))
          }
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by role"
          value={filters.role}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, role: event.target.value }))
          }
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      {state.loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : state.error ? (
        <EmptyState
          icon={UsersIcon}
          title="Couldn't load users"
          description={state.error}
          action={
            <button
              type="button"
              onClick={fetchUsers}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Try again
            </button>
          }
        />
      ) : state.users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No users found"
          description="Try a broader search or clear the filters."
        />
      ) : (
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="hidden px-3 py-2 sm:table-cell">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="hidden px-3 py-2 md:table-cell">Joined</th>
                <th className="hidden px-3 py-2 lg:table-cell">Last seen</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((user) => (
                <UserRow
                  key={user._id}
                  user={user}
                  isSelf={user._id === currentUser?._id}
                  pendingAction={pendingActionByUser.get(user._id) ?? null}
                  onSuspendToggle={handleSuspendToggle}
                  onRoleToggle={handleRoleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.totalPages > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-sm"
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

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        variant={confirm?.variant ?? 'danger'}
      >
        {confirm?.body}
      </ConfirmModal>
    </div>
  );
};

export default AdminUsers;
