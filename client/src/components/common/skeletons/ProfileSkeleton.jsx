import Skeleton from './Skeleton.jsx';

/**
 * ProfileSkeleton — placeholder for `/u/:username` while the profile
 * is being fetched. Mirrors the eventual layout (banner, avatar, title
 * column, action cluster, bio + meta row) so the page doesn't reflow
 * once the data arrives.
 */
const ProfileSkeleton = () => (
  <div
    aria-busy="true"
    aria-label="Loading profile"
    className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8"
  >
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <Skeleton className="h-24 w-full sm:h-32" rounded="none" />

      <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-12 flex flex-col items-start gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-3">
            <Skeleton className="h-20 w-20 ring-4 ring-white sm:h-24 sm:w-24 dark:ring-gray-900" rounded="full" />
            <div className="space-y-2 pb-1 sm:pb-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </article>
  </div>
);

export default ProfileSkeleton;
