import { useId } from 'react';
import clsx from 'clsx';

/**
 * ToggleSwitch — accessible on/off switch used across the Settings tree.
 *
 * Why a custom switch instead of a native `<input type="checkbox">`:
 *   - The visual affordance for a "preference" reads better as a
 *     sliding pill than a checkbox in a settings list.
 *   - We still expose the underlying control as `role="switch"` with
 *     `aria-checked` so assistive tech announces it correctly.
 *
 * Behaviour notes:
 *   - The control is rendered as a `<button>` so it participates in the
 *     normal Tab order and Space/Enter activation without us
 *     hand-rolling key handlers.
 *   - `disabled` short-circuits both the click handler and the visible
 *     state so callers can render an in-flight save without losing
 *     keyboard focus on the row.
 *   - When a `label` is provided we render it next to the switch and
 *     wire up `aria-labelledby` — the same `<label htmlFor>` pattern
 *     a native checkbox would give us, without the markup gymnastics.
 */
const ToggleSwitch = ({
  checked = false,
  onChange,
  disabled = false,
  label,
  description,
  className,
  id,
}) => {
  const generatedId = useId();
  const switchId = id ?? `toggle-${generatedId}`;
  const labelId = label ? `${switchId}-label` : undefined;
  const descriptionId = description ? `${switchId}-description` : undefined;

  const handleClick = () => {
    if (disabled) return;
    onChange?.(!checked);
  };

  const switchEl = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={handleClick}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
        checked
          ? 'bg-brand-600 dark:bg-brand-500'
          : 'bg-gray-300 dark:bg-gray-700',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label && !description) {
    return <span className={className}>{switchEl}</span>;
  }

  return (
    <div className={clsx('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">
        {label ? (
          <label
            id={labelId}
            htmlFor={switchId}
            className="block text-sm font-medium text-gray-900 dark:text-white"
          >
            {label}
          </label>
        ) : null}
        {description ? (
          <p
            id={descriptionId}
            className="mt-1 text-xs text-gray-500 dark:text-gray-400"
          >
            {description}
          </p>
        ) : null}
      </div>
      {switchEl}
    </div>
  );
};

export default ToggleSwitch;
