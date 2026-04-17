import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  AtSign,
  CalendarDays,
  Clock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Avatar from '../../components/common/Avatar.jsx';
import Badge from '../../components/common/Badge.jsx';
import ConfirmModal from '../../components/common/ConfirmModal.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  deleteUser,
  getUser,
  updateUserRole,
  updateUserStatus,
} from '../../api/admin.service.js';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * AdminUserDetail — full profile view at `/admin/users/:id`.
 *
 * The page mirrors `AdminUsers` row actions in a side panel so an
 * admin opening a user from anywhere (a report target, a search
 * result link, deep-link from logs) lands on a screen with full
 * context AND the same set of moderator levers.
 *
 * Why we don't render "sent messages" / "conversations" stats:
 *   Those numbers would require additional admin endpoints that the
 *   server does not expose today. Showing fabricated zeros would be
 *   worse than showing nothing — when the server grows the surface
 *   we will populate the panel here in a separate change.
 *
 * Self-protection contract is identical to `AdminUsers` (server is
 * the authority; this UI just disables the levers that would 403).
 */

const STATUS_VARIANT = {
  active: 'success',
  suspended: 'danger',
  deleted: 'neutral',
};

const ROLE_VARIANT = {
  admin: 'brand',
  user: 'neutral',
};

const SELF_TOOLTIP = 'You cannot modify your own account';
const ADMIN_TARGET_TOOLTIP =
  'Admin accounts cannot be moderated from this panel';

const AdminUserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [state, setState] = useState({
    loading: true,
    error: null,
    user: null,
  });
  const [pendingAction, setPendingAction] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const fetchUser = useCallback(async () => {
    setState({ loading: true, error: null, user: null });
    try {
      const result = await getUser(id);
      setState({
        loading: false,
        error: null,
        user: result?.data?.user ?? null,
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Failed to load user.';
      setState({ loading: false, error: message, user: null });
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const target = state.user;
  const isSelf = Boolean(target && currentUser && target._id === currentUser._id);
  const isAdmin = target?.role === 'admin';
  const isSuspended = target?.status === 'suspended';
  const protectedTarget = isSelf || isAdmin;
  const protectedTooltip = isSelf
    ? SELF_TOOLTIP
    : isAdmin
      ? ADMIN_TARGET_TOOLTIP
      : undefined;

  /* ---------- Action handlers (parallel to AdminUsers, simplified) ---------- */

  const handleSuspendToggle = () => {
    if (!target) return;
    const nextStatus = isSuspended ? 'active' : 'suspended';
    const isSuspending = nextStatus === 'suspended';
    setConfirm({
      title: isSuspending ? 'Suspend user?' : 'Reinstate user?',
      body: isSuspending
        ? `@${target.username} will lose access immediately and every active session will be disconnected.`
        : `@${target.username} will regain access and be able to sign in again.`,
      confirmLabel: isSuspending ? 'Suspend' : 'Reinstate',
      variant: isSuspending ? 'danger' : 'primary',
      onConfirm: async () => {
        setPendingAction('status');
        try {
          const result = await updateUserStatus(target._id, {
            status: nextStatus,
          });
          setState((prev) => ({
            ...prev,
            user: prev.user
              ? { ...prev.user, status: result?.data?.status ?? nextStatus }
              : prev.user,
          }));
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
          setPendingAction(null);
        }
      },
    });
  };

  const handleRoleToggle = () => {
    if (!target) return;
    const nextRole = isAdmin ? 'user' : 'admin';
    const isPromoting = nextRole === 'admin';
    setConfirm({
      title: isPromoting ? 'Promote to admin?' : 'Demote to user?',
      body: isPromoting
        ? `@${target.username} will gain access to every admin tool, including this panel.`
        : `@${target.username} will lose admin privileges.`,
      confirmLabel: isPromoting ? 'Promote' : 'Demote',
      variant: isPromoting ? 'primary' : 'danger',
      onConfirm: async () => {
        setPendingAction('role');
        try {
          const result = await updateUserRole(target._id, nextRole);
          setState((prev) => ({
            ...prev,
            user: prev.user
              ? { ...prev.user, role: result?.data?.role ?? nextRole }
              : prev.user,
          }));
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
          setPendingAction(null);
        }
      },
    });
  };

  const handleDelete = () => {
    if (!target) return;
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
        setPendingAction('delete');
        try {
          await deleteUser(target._id);
          toast.success(`Deleted @${target.username}`);
          setConfirm(null);
          navigate('/admin/users', { replace: true });
        } catch (err) {
          const message =
            err?.response?.data?.message || 'Could not delete user.';
          toast.error(message);
          throw err;
        } finally {
          setPendingAction(null);
        }
      },
    });
  };

  /* ---------- Render ---------- */

  if (state.loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state.error || !target) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState
          icon={ShieldAlert}
          title="User not found"
          description={state.error || 'This account no longer exists.'}
          action={
            <Link
              to="/admin/users"
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Back to users
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center dark:border-gray-800 dark:bg-gray-950">
        <Avatar src={target.avatarUrl} name={target.displayName} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-gray-900 dark:text-white">
              {target.displayName || target.username}
            </h1>
            <Badge variant={ROLE_VARIANT[target.role] ?? 'neutral'}>
              {target.role}
            </Badge>
            <Badge variant={STATUS_VARIANT[target.status] ?? 'neutral'}>
              {target.status}
            </Badge>
            {isAdmin ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                title="Admin accounts are protected"
              >
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Protected
              </span>
            ) : null}
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <DetailItem icon={AtSign} label="Username" value={`@${target.username}`} />
            <DetailItem icon={Mail} label="Email" value={target.email || '—'} />
            <DetailItem
              icon={CalendarDays}
              label="Joined"
              value={formatRelativeTime(target.createdAt) || '—'}
            />
            <DetailItem
              icon={Clock}
              label="Last seen"
              value={
                target.lastSeenAt ? formatRelativeTime(target.lastSeenAt) : '—'
              }
            />
          </dl>

          {target.bio ? (
            <p className="mt-3 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
              {target.bio}
            </p>
          ) : null}
        </div>
      </header>

      <section
        aria-labelledby="actions-heading"
        className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950"
      >
        <h2
          id="actions-heading"
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          Moderator actions
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Every action is logged and emits a real-time signal to the
          target's active sessions.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            icon={isSuspended ? UserCheck : UserX}
            label={isSuspended ? 'Reinstate user' : 'Suspend user'}
            tone={isSuspended ? 'success' : 'warning'}
            onClick={handleSuspendToggle}
            disabled={protectedTarget}
            disabledTitle={protectedTooltip}
            busy={pendingAction === 'status'}
          />
          <ActionButton
            icon={isAdmin ? ArrowDownCircle : ArrowUpCircle}
            label={isAdmin ? 'Demote to user' : 'Promote to admin'}
            tone="brand"
            onClick={handleRoleToggle}
            disabled={isSelf}
            disabledTitle={isSelf ? SELF_TOOLTIP : undefined}
            busy={pendingAction === 'role'}
          />
          <ActionButton
            icon={Trash2}
            label="Delete account"
            tone="danger"
            onClick={handleDelete}
            disabled={protectedTarget}
            disabledTitle={protectedTooltip}
            busy={pendingAction === 'delete'}
          />
        </div>
      </section>

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

const BackLink = () => (
  <Link
    to="/admin/users"
    className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    <span>Back to users</span>
  </Link>
);

const DetailItem = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
    <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
    <span className="text-xs uppercase tracking-wide text-gray-400">
      {label}:
    </span>
    <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
      {value}
    </span>
  </div>
);

const TONE_BTN = {
  brand:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500',
  warning:
    'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

const ActionButton = ({
  icon: Icon,
  label,
  tone = 'brand',
  busy = false,
  disabled = false,
  disabledTitle,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    title={disabled ? disabledTitle || label : label}
    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 dark:focus-visible:ring-offset-gray-950 dark:disabled:bg-gray-800 dark:disabled:text-gray-500 ${
      disabled ? '' : TONE_BTN[tone] ?? TONE_BTN.brand
    }`}
  >
    {busy ? (
      <span
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
      />
    ) : (
      <Icon className="h-4 w-4" aria-hidden="true" />
    )}
    <span>{label}</span>
  </button>
);

export default AdminUserDetail;
