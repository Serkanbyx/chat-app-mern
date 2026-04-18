import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';

import Avatar from '../common/Avatar.jsx';
import Badge from '../common/Badge.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * UserRow — single row of `AdminUsers`'s data table.
 *
 * Why pulled into its own component (instead of inlined in the page):
 *   - Each row owns five action buttons whose disabled / variant rules
 *     depend on three signals (target status, target role, "is this me?").
 *     Inlining would push the page well past 250 LOC of nested ternaries
 *     and make Strict-Mode renders measurably slower for >50 users.
 *   - Re-rendered in isolation when the row's user object changes (page
 *     paginates server-side, so identity churn is naturally bounded).
 *
 * Self-protection contract (mirrors the server):
 *   - Every action that mutates the target is disabled and tooltipped
 *     when `isSelf` is true. The server ALSO enforces 403 on those
 *     paths — the disable here is purely UX so the admin doesn't see a
 *     button and then a toast saying "you can't do that".
 *   - Suspending / deleting an admin target is also disabled because the
 *     server forbids both at the route layer for the same blast-radius
 *     reasons (one compromised admin can't silence the team).
 *
 * `pendingAction` is a discriminator owned by the page so only the
 * button currently in flight shows the spinner — the remaining buttons
 * stay clickable for batched moderation.
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

const UserRow = ({
  user,
  isSelf,
  pendingAction = null,
  onSuspendToggle,
  onRoleToggle,
  onDelete,
}) => {
  const isAdmin = user.role === 'admin';
  const isSuspended = user.status === 'suspended';

  const protectedTarget = isSelf || isAdmin;
  const protectedTooltip = isSelf
    ? SELF_TOOLTIP
    : isAdmin
      ? ADMIN_TARGET_TOOLTIP
      : undefined;

  const isStatusBusy = pendingAction === 'status';
  const isRoleBusy = pendingAction === 'role';
  const isDeleteBusy = pendingAction === 'delete';
  const anyBusy = Boolean(pendingAction);

  return (
    <tr className="border-t border-gray-100 transition-colors hover:bg-gray-50/60 dark:border-gray-800 dark:hover:bg-gray-900/60">
      <td className="px-3 py-3">
        <Link
          to={`/admin/users/${user._id}`}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {user.displayName || user.username}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              @{user.username}
            </p>
          </div>
        </Link>
      </td>

      <td className="hidden px-3 py-3 text-xs text-gray-600 sm:table-cell dark:text-gray-300">
        <span className="block max-w-56 truncate">{user.email || '—'}</span>
      </td>

      <td className="px-3 py-3">
        <Badge variant={ROLE_VARIANT[user.role] ?? 'neutral'}>
          {user.role}
        </Badge>
      </td>

      <td className="px-3 py-3">
        <Badge variant={STATUS_VARIANT[user.status] ?? 'neutral'}>
          {user.status}
        </Badge>
      </td>

      <td className="hidden px-3 py-3 text-xs text-gray-500 md:table-cell dark:text-gray-400">
        {formatRelativeTime(user.createdAt)}
      </td>

      <td className="hidden px-3 py-3 text-xs text-gray-500 lg:table-cell dark:text-gray-400">
        {user.lastSeenAt ? formatRelativeTime(user.lastSeenAt) : '—'}
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <RowAction
            as={Link}
            to={`/admin/users/${user._id}`}
            label="View detail"
            icon={Eye}
          />

          <RowAction
            label={isSuspended ? 'Reinstate user' : 'Suspend user'}
            icon={isSuspended ? UserCheck : UserX}
            tone={isSuspended ? 'success' : 'warning'}
            onClick={() => onSuspendToggle?.(user)}
            disabled={protectedTarget || anyBusy}
            disabledTitle={protectedTooltip}
            busy={isStatusBusy}
          />

          <RowAction
            label={isAdmin ? 'Demote to user' : 'Promote to admin'}
            icon={isAdmin ? ArrowDownCircle : ArrowUpCircle}
            tone="brand"
            onClick={() => onRoleToggle?.(user)}
            disabled={isSelf || anyBusy}
            disabledTitle={isSelf ? SELF_TOOLTIP : undefined}
            busy={isRoleBusy}
          />

          <RowAction
            label="Delete user"
            icon={Trash2}
            tone="danger"
            onClick={() => onDelete?.(user)}
            disabled={protectedTarget || anyBusy}
            disabledTitle={protectedTooltip}
            busy={isDeleteBusy}
          />

          {isAdmin ? (
            <ShieldCheck
              className="ml-1 h-4 w-4 text-brand-500"
              aria-label="Admin account — protected"
            />
          ) : null}
        </div>
      </td>
    </tr>
  );
};

const TONE_STYLES = {
  neutral: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800',
  brand: 'text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40',
  success: 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30',
  warning: 'text-amber-600 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/30',
  danger: 'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40',
};

/**
 * RowAction — icon-only button (or `Link`) used by every row action.
 * `busy` swaps the icon for a small spinning ring without changing the
 * footprint, so the row layout never reflows mid-mutation.
 */
const RowAction = ({
  as: Component = 'button',
  icon: Icon,
  label,
  tone = 'neutral',
  busy = false,
  disabled = false,
  disabledTitle,
  ...rest
}) => {
  const finalProps =
    Component === 'button'
      ? { type: 'button', disabled: disabled || busy, ...rest }
      : { ...rest, ...(disabled ? { onClick: (e) => e.preventDefault() } : {}) };

  return (
    <Component
      {...finalProps}
      title={disabled ? disabledTitle || label : label}
      aria-label={label}
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        disabled
          ? 'cursor-not-allowed text-gray-300 dark:text-gray-700'
          : TONE_STYLES[tone] ?? TONE_STYLES.neutral,
      )}
    >
      {busy ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
    </Component>
  );
};

export default UserRow;
