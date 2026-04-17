import { MessageSquare } from 'lucide-react';

/**
 * EmptyChatPage — rendered at `/chat` when no conversation is selected.
 *
 * This page lives inside `ChatLayout` so the conversation sidebar is
 * already on screen on desktop; the empty pane just invites the user
 * to pick a conversation. On mobile the layout swaps panes by URL, so
 * this state actually never reaches mobile (the sidebar takes the
 * whole screen at `/chat`) — but it stays valid as a fallback.
 */
const EmptyChatPage = () => (
  <div className="flex h-full w-full items-center justify-center bg-gray-50 px-6 text-center dark:bg-gray-950">
    <div className="max-w-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
        <MessageSquare className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Select a conversation
      </h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Pick a chat from the sidebar to start messaging, or create a new one to
        reach out to someone.
      </p>
    </div>
  </div>
);

export default EmptyChatPage;
