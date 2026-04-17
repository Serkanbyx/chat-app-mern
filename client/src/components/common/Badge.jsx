import clsx from 'clsx';

/**
 * Badge — small count/label pill.
 *
 * Used by the navbar bell (unread notifications) and the conversation
 * list (unread per chat). Counts above `max` collapse to "max+" so a
 * runaway counter doesn't break the layout.
 */

const VARIANTS = {
  brand: 'bg-brand-600 text-white',
  danger: 'bg-red-600 text-white',
  neutral: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100',
  success: 'bg-emerald-600 text-white',
};

const Badge = ({
  count,
  children,
  max = 99,
  variant = 'brand',
  hideOnZero = true,
  className,
}) => {
  if (count != null) {
    if (hideOnZero && count <= 0) return null;
    const display = count > max ? `${max}+` : String(count);
    return (
      <span
        className={clsx(
          'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
          VARIANTS[variant] ?? VARIANTS.brand,
          className,
        )}
        aria-label={`${count} unread`}
      >
        {display}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant] ?? VARIANTS.brand,
        className,
      )}
    >
      {children}
    </span>
  );
};

export default Badge;
