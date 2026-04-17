import Skeleton from './Skeleton.jsx';

/**
 * ConversationListSkeleton — shimmer rows shown while the sidebar is
 * fetching its first page of conversations.
 *
 * Why a deterministic count (not random):
 *   The number of rows must be predictable so the layout doesn't shift
 *   when the real data lands. 6 rows fit comfortably above the fold on
 *   a 768 px viewport without making the loader feel busier than the
 *   eventual content.
 */
const ConversationListSkeleton = ({ rows = 6 }) => (
  <ul className="space-y-1.5" aria-busy="true" aria-label="Loading conversations">
    {Array.from({ length: rows }).map((_, index) => (
      <li
        key={index}
        className="flex items-center gap-3 rounded-lg px-2 py-2"
      >
        <Skeleton className="h-10 w-10" rounded="full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-10" />
          </div>
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      </li>
    ))}
  </ul>
);

export default ConversationListSkeleton;
