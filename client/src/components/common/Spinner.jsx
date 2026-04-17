import clsx from 'clsx';

/**
 * Spinner — minimal, theme-aware loading indicator.
 *
 * `fullPage` is the variant used by route guards while the auth
 * bootstrap is in flight. It centres the spinner over the entire
 * viewport so the user never sees a blank screen flash before the
 * app decides whether they're authenticated.
 *
 * `size` is a Tailwind-friendly token (sm | md | lg | xl) rather than
 * a raw pixel value so the spinner sits cleanly inside buttons,
 * inline next to text, or as a full-page overlay without per-callsite
 * style overrides.
 */
const SIZE_MAP = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
  xl: 'h-14 w-14 border-4',
};

const Spinner = ({ size = 'md', fullPage = false, label = 'Loading…', className }) => {
  const ring = (
    <span
      role="status"
      aria-label={label}
      className={clsx(
        'inline-block animate-spin rounded-full border-solid',
        'border-brand-500/30 border-t-brand-500',
        'dark:border-brand-400/30 dark:border-t-brand-400',
        SIZE_MAP[size] ?? SIZE_MAP.md,
        className,
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );

  if (!fullPage) return ring;

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-gray-950"
      aria-busy="true"
    >
      {ring}
    </div>
  );
};

export default Spinner;
