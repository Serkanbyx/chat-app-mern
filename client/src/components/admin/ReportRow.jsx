import clsx from 'clsx';
import { MessageSquare, MessagesSquare, User as UserIcon } from 'lucide-react';

import Avatar from '../common/Avatar.jsx';
import Badge from '../common/Badge.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * ReportRow — single row in the moderator queue.
 *
 * Why a stand-alone component:
 *   - The reports table is shown in two places: the dashboard's
 *     "Recent reports" panel and the dedicated `/admin/reports` page.
 *     Centralising the row keeps the visual / a11y treatment (status
 *     badge colour, target-type icon, reporter avatar) identical
 *     across both surfaces.
 *
 * The row is a `<tr>` so the parent owns the `<table>` semantics. We
 * deliberately do NOT wrap the entire row in a `<button>` (that would
 * break table semantics for screen readers); instead the parent
 * registers a click handler on the row and we expose `onSelect` here
 * for clean ergonomics.
 */

const STATUS_VARIANT = {
  pending: 'warning',
  reviewed: 'brand',
  dismissed: 'neutral',
  actionTaken: 'success',
};

const STATUS_LABEL = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
  actionTaken: 'Action taken',
};

const TARGET_ICON = {
  user: UserIcon,
  message: MessageSquare,
  conversation: MessagesSquare,
};

const REASON_LABEL = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  other: 'Other',
};

const ReportRow = ({ report, onSelect, compact = false }) => {
  const reporter = report.reporter;
  const reporterName = reporter?.displayName || reporter?.username || 'Unknown';
  const TargetIcon = TARGET_ICON[report.targetType] ?? UserIcon;
  const status = report.status ?? 'pending';

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(report);
    }
  };

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(report)}
      onKeyDown={handleKeyDown}
      className={clsx(
        'cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50/60 focus:bg-gray-50 focus:outline-none dark:border-gray-800 dark:hover:bg-gray-900/60 dark:focus:bg-gray-900',
        compact && 'text-xs',
      )}
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          >
            <TargetIcon className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-medium capitalize text-gray-700 dark:text-gray-200">
            {report.targetType}
          </span>
        </div>
      </td>

      <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-200">
        <span className="block truncate font-medium">
          {REASON_LABEL[report.reason] ?? report.reason}
        </span>
        {report.description && !compact ? (
          <span className="mt-0.5 block max-w-[28rem] truncate text-xs text-gray-500 dark:text-gray-400">
            {report.description}
          </span>
        ) : null}
      </td>

      {!compact ? (
        <td className="hidden px-3 py-3 sm:table-cell">
          <div className="flex items-center gap-2">
            <Avatar
              src={reporter?.avatarUrl}
              name={reporterName}
              size="xs"
            />
            <span className="truncate text-xs text-gray-600 dark:text-gray-300">
              @{reporter?.username ?? 'unknown'}
            </span>
          </div>
        </td>
      ) : null}

      <td className="px-3 py-3">
        <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>
          {STATUS_LABEL[status] ?? status}
        </Badge>
      </td>

      <td className="hidden px-3 py-3 text-xs text-gray-500 md:table-cell dark:text-gray-400">
        {formatRelativeTime(report.createdAt)}
      </td>
    </tr>
  );
};

export default ReportRow;
