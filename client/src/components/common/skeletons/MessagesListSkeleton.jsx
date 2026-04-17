import clsx from 'clsx';

import Skeleton from './Skeleton.jsx';

/**
 * MessagesListSkeleton — shimmering bubbles shown while a conversation
 * is loading its first page of messages.
 *
 * The bubbles alternate left/right with varying widths so the loader
 * reads as "a chat is loading", not "rows of identical placeholders".
 * The pattern is fixed (not random) so re-renders don't shift the
 * layout while the data is in flight.
 */
const PATTERN = [
  { side: 'left', width: 'w-3/5' },
  { side: 'right', width: 'w-2/5' },
  { side: 'left', width: 'w-2/3' },
  { side: 'right', width: 'w-1/2' },
  { side: 'left', width: 'w-1/3' },
  { side: 'right', width: 'w-3/5' },
];

const MessagesListSkeleton = () => (
  <div
    aria-busy="true"
    aria-label="Loading messages"
    className="flex w-full flex-col gap-3 px-3 py-4"
  >
    {PATTERN.map((row, index) => (
      <div
        key={index}
        className={clsx(
          'flex items-end gap-2',
          row.side === 'right' ? 'justify-end' : 'justify-start',
        )}
      >
        {row.side === 'left' ? (
          <Skeleton className="h-7 w-7 shrink-0" rounded="full" />
        ) : null}
        <Skeleton
          className={clsx('h-10 max-w-md', row.width)}
          rounded="lg"
        />
      </div>
    ))}
  </div>
);

export default MessagesListSkeleton;
