import clsx from 'clsx';

/**
 * PresenceDot — small online/offline indicator anchored at the corner
 * of an `Avatar`.
 *
 * Why this is its own component (vs. reusing `Avatar`'s `showStatus`
 * prop): the conversation list needs the dot in places where there is
 * no avatar (e.g. inline next to a name in tooltips), and it lets us
 * decouple presence from the avatar's privacy mask. Presence visibility
 * is already enforced server-side — this component never fabricates an
 * online state on its own.
 */

const SIZE_MAP = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const PresenceDot = ({ online = false, size = 'sm', className, withRing = true }) => (
  <span
    role="status"
    aria-label={online ? 'Online' : 'Offline'}
    className={clsx(
      'inline-block rounded-full',
      SIZE_MAP[size] ?? SIZE_MAP.sm,
      online ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600',
      withRing && 'ring-2 ring-white dark:ring-gray-900',
      className,
    )}
  />
);

export default PresenceDot;
