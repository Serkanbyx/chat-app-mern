import Skeleton from './Skeleton.jsx';

/**
 * AdminTableSkeleton — placeholder for the moderation tables
 * (`AdminUsers`, `AdminReports`) while the first page is in flight.
 *
 * The number of columns is configurable so both tables can use the
 * same primitive without faking columns they don't actually render.
 * The header row uses thinner bars so the loader still reads as a
 * "table" structure rather than a grid of identical pills.
 */
const AdminTableSkeleton = ({ rows = 8, columns = 5 }) => (
  <div
    aria-busy="true"
    aria-label="Loading rows"
    className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800"
  >
    <div className="grid gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/60"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton key={index} className="h-2.5 w-16" />
      ))}
    </div>

    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <li
          key={rowIndex}
          className="grid gap-3 px-3 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <div
              key={columnIndex}
              className="flex items-center gap-2"
            >
              {columnIndex === 0 ? (
                <Skeleton className="h-8 w-8 shrink-0" rounded="full" />
              ) : null}
              <Skeleton
                className={
                  columnIndex === 0
                    ? 'h-3 flex-1'
                    : columnIndex === columns - 1
                      ? 'h-3 w-1/2'
                      : 'h-3 w-3/4'
                }
              />
            </div>
          ))}
        </li>
      ))}
    </ul>
  </div>
);

export default AdminTableSkeleton;
