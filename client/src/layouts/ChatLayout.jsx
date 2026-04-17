import { Outlet, useMatch } from 'react-router-dom';
import clsx from 'clsx';

import Sidebar from '../components/layout/Sidebar.jsx';

/**
 * ChatLayout — the only layout that goes full-bleed (no `Navbar`).
 *
 * Desktop (md+):
 *   Two-pane: a fixed-width sidebar with the conversation list on the
 *   left, the active conversation panel on the right. Both panes are
 *   always visible.
 *
 * Mobile:
 *   Single-pane that swaps based on the URL.
 *     `/chat`                → sidebar full-width (list view)
 *     `/chat/:conversationId`→ outlet full-width (conversation view)
 *   This avoids a permanent off-canvas drawer pattern: the URL itself
 *   is the source of truth for which pane is on screen, so the OS
 *   back gesture / swipe-back returns from the conversation to the
 *   list naturally.
 *
 * `h-[100dvh]` (dynamic viewport height) is used instead of `h-screen`
 * so the mobile address bar collapse/expand does NOT cut off the
 * composer at the bottom of the chat panel.
 */
const ChatLayout = () => {
  const inConversation = useMatch('/chat/:conversationId');

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      <div
        className={clsx(
          'h-full w-full md:w-80 md:max-w-xs md:shrink-0 lg:w-96',
          inConversation ? 'hidden md:flex' : 'flex',
        )}
      >
        <Sidebar />
      </div>

      <div
        className={clsx(
          'h-full min-w-0 flex-1',
          inConversation ? 'flex' : 'hidden md:flex',
        )}
      >
        <div className="flex h-full w-full flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default ChatLayout;
