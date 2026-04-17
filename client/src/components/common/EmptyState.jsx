import clsx from 'clsx';
import { Inbox } from 'lucide-react';

/**
 * EmptyState — generic "nothing to show here" placeholder.
 *
 * Used by lists (Blocked Users, future Notification Center) when the
 * collection is empty after a successful fetch. Distinct from
 * `PagePlaceholder` (which marks a not-yet-implemented route).
 *
 * Accepts an optional `action` slot for a CTA button so feature pages
 * can route the user toward whatever populates the list.
 */
const EmptyState = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}) => (
  <div
    role="status"
    className={clsx(
      'flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center dark:border-gray-700',
      className,
    )}
  >
    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    {title ? (
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
    ) : null}
    {description ? (
      <p className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
        {description}
      </p>
    ) : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export default EmptyState;
