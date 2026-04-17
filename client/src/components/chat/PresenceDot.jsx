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
 *
 * Subtle "live" pulse:
 *   When the user is online we layer a soft pinging halo behind the dot
 *   so a glance at a long sidebar surfaces who is reachable right now.
 *   The animation respects `prefers-reduced-motion` (the global rule in
 *   `index.css` neutralises `animate-ping`/`animate-pulse` for users
 *   who opted out), so we don't need an extra guard here. Offline dots
 *   stay completely static — animating absence would be visual noise.
 */

const SIZE_MAP = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const PresenceDot = ({
  online = false,
  size = 'sm',
  className,
  withRing = true,
  pulse = true,
}) => {
  const sizeClasses = SIZE_MAP[size] ?? SIZE_MAP.sm;

  return (
    <span
      role="status"
      aria-label={online ? 'Online' : 'Offline'}
      className={clsx('relative inline-flex', sizeClasses, className)}
    >
      {online && pulse ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={clsx(
          'relative inline-block h-full w-full rounded-full',
          online ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600',
          withRing && 'ring-2 ring-white dark:ring-gray-900',
        )}
      />
    </span>
  );
};

export default PresenceDot;
