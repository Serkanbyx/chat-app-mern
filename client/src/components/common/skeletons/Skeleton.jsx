import clsx from 'clsx';

/**
 * Skeleton — primitive shimmer block used by every skeleton screen.
 *
 * Shimmer style: a low-contrast pulse on `bg-gray-200` / `bg-gray-700`
 * that automatically pauses under `prefers-reduced-motion` (the global
 * rule in `index.css` collapses every `animation-duration` to 0). We
 * intentionally avoid a custom wave-gradient so reduced-motion users
 * still see the placeholder shape — just frozen.
 *
 * Usage: compose in feature-level skeletons (lists, profiles, tables)
 * rather than inlining background colours throughout the codebase.
 */
const Skeleton = ({ className, rounded = 'md', as: As = 'span' }) => {
  const radius =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'lg'
        ? 'rounded-lg'
        : rounded === 'none'
          ? ''
          : 'rounded-md';

  return (
    <As
      aria-hidden="true"
      className={clsx(
        'block animate-pulse bg-gray-200 dark:bg-gray-700/70',
        radius,
        className,
      )}
    />
  );
};

export default Skeleton;
