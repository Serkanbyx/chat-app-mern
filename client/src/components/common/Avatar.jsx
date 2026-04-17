import { useMemo, useState } from 'react';
import clsx from 'clsx';

/**
 * Avatar — circular user image with graceful fallback to initials.
 *
 * Why we don't render an `<img>` until we know it loads:
 *   A broken avatar URL (Cloudinary deleted, CORS blocked) would show
 *   the browser's default broken-image glyph, which looks worse than
 *   no image at all. We render `<img>` optimistically but swap to the
 *   initials fallback on `onError`.
 *
 * Online dot is purely presentational — actual presence comes from
 * `SocketContext.onlineUserIds`; consumers pass `online` as a boolean.
 */

const SIZE_MAP = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

const DOT_SIZE = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
};

const getInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const Avatar = ({
  src,
  name = '',
  size = 'md',
  online = false,
  showStatus = false,
  className,
}) => {
  const [errored, setErrored] = useState(false);
  const initials = useMemo(() => getInitials(name), [name]);
  const sizeClasses = SIZE_MAP[size] ?? SIZE_MAP.md;
  const dotClasses = DOT_SIZE[size] ?? DOT_SIZE.md;

  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
        sizeClasses,
        className,
      )}
      title={name || undefined}
    >
      {src && !errored ? (
        <img
          src={src}
          alt={name ? `${name} avatar` : 'User avatar'}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
      {showStatus ? (
        <span
          className={clsx(
            'absolute right-0 bottom-0 rounded-full ring-2 ring-white dark:ring-gray-950',
            dotClasses,
            online ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600',
          )}
          aria-label={online ? 'Online' : 'Offline'}
        />
      ) : null}
    </span>
  );
};

export default Avatar;
