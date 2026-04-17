import clsx from 'clsx';
import { Inbox } from 'lucide-react';

/**
 * EmptyState — generic "nothing to show here" placeholder.
 *
 * Used by lists (Blocked Users, conversations sidebar, admin tables,
 * notifications page) when the collection is empty after a successful
 * fetch. Distinct from `PagePlaceholder`, which marks a not-yet-built
 * route.
 *
 * `action` is intentionally polymorphic so callers can pick whichever
 * shape fits their context:
 *   - **Render prop / node**: `action={<Link to="...">Go</Link>}` —
 *     full control over the rendered button when the page already has
 *     its own CTA component.
 *   - **Callback + `actionLabel`**: `action={openComposer}` plus a
 *     `actionLabel="Start a chat"` — convenience shortcut that gets a
 *     consistent brand-styled button so the call site stays terse.
 * Why both: forcing every consumer to import a Button just to get the
 * "right" colour led to copy-pasted variants drifting apart. The
 * callback form is the recommended path going forward; the node form
 * stays for the few existing call sites that pass a custom action.
 */
const EmptyState = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  actionLabel,
  className,
}) => {
  const renderAction = () => {
    if (!action) return null;
    if (typeof action === 'function') {
      if (!actionLabel) return null;
      return (
        <button
          type="button"
          onClick={action}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:bg-brand-500 dark:hover:bg-brand-400 dark:focus-visible:ring-offset-gray-900"
        >
          {actionLabel}
        </button>
      );
    }
    return action;
  };

  const actionNode = renderAction();

  return (
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
      {actionNode ? <div className="mt-4">{actionNode}</div> : null}
    </div>
  );
};

export default EmptyState;
