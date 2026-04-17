import { Sparkles } from 'lucide-react';

/**
 * PagePlaceholder — neutral "this section is wired up but not built
 * yet" panel used by the route stubs created in Step 22.
 *
 * Centralising the placeholder markup means the visual style of the
 * unfinished routes stays consistent, and replacing it with real
 * content in later steps is a one-import-removal operation per page.
 */
const PagePlaceholder = ({ title, description }) => (
  <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
      <Sparkles className="h-6 w-6" aria-hidden="true" />
    </span>
    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
    {description ? (
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {description}
      </p>
    ) : null}
  </div>
);

export default PagePlaceholder;
