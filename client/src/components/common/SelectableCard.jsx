import clsx from 'clsx';
import { Check } from 'lucide-react';

/**
 * SelectableCard — radio-style card used by Appearance settings (theme,
 * font size, density). Each card is a single tappable target with a
 * highlighted state when selected.
 *
 * Accessibility:
 *   - Rendered as `<button role="radio">` so screen readers announce a
 *     radio-group when wrapped in `role="radiogroup"`.
 *   - The check icon in the corner is decorative; the radio state is
 *     announced via `aria-checked`.
 */
const SelectableCard = ({
  selected = false,
  onSelect,
  disabled = false,
  title,
  description,
  icon: Icon,
  className,
}) => {
  const handleClick = () => {
    if (disabled || selected) return;
    onSelect?.();
  };

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={handleClick}
      className={clsx(
        'group relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
        selected
          ? 'border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-900/20'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800/60',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {Icon ? (
        <span
          className={clsx(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            selected
              ? 'bg-brand-600 text-white dark:bg-brand-500'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {description}
          </span>
        ) : null}
      </span>

      {selected ? (
        <span
          aria-hidden="true"
          className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white dark:bg-brand-500"
        >
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
};

export default SelectableCard;
