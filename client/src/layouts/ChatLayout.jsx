import { Outlet, useMatch } from 'react-router-dom';
import clsx from 'clsx';
import { WifiOff } from 'lucide-react';

import Sidebar from '../components/layout/Sidebar.jsx';
import NewChatModal from '../components/chat/NewChatModal.jsx';
import NewGroupModal from '../components/chat/NewGroupModal.jsx';
import NotificationPermissionBanner from '../components/chat/NotificationPermissionBanner.jsx';
import {
  ChatStateProvider,
  useChatState,
} from '../contexts/ChatStateContext.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';

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
 * `h-dvh` (dynamic viewport height) is used instead of `h-screen`
 * so the mobile address bar collapse/expand does NOT cut off the
 * composer at the bottom of the chat panel.
 *
 * Connection strip:
 *   Rendered above both panes whenever the live socket is down. The
 *   message is intentionally generic ("Reconnecting…") — never echo
 *   raw socket errors to the user, those can leak server topology.
 *
 * `<ChatStateProvider>` lives here (not in `main.jsx`) because the
 * conversation cache only needs to exist while the user is on a
 * `/chat/*` route. Mounting it at the layout level means navigating
 * to `/settings` and back triggers a fresh fetch — that small cost
 * keeps the cache from going stale across long-lived sessions.
 */
/**
 * ChatComposers — mounts the "create conversation" modals once,
 * driven by `ChatStateContext`. Kept as a separate component so it
 * can use the context (which is only available below the provider)
 * without forcing the surrounding layout into a second render pass.
 */
const ChatComposers = () => {
  const { isNewChatOpen, isNewGroupOpen, closeComposer } = useChatState();
  return (
    <>
      <NewChatModal open={isNewChatOpen} onClose={closeComposer} />
      <NewGroupModal open={isNewGroupOpen} onClose={closeComposer} />
    </>
  );
};

const ChatLayout = () => {
  const inConversation = useMatch('/chat/:conversationId');
  const { isConnected } = useSocket();

  return (
    <ChatStateProvider>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        {!isConnected ? (
          <div
            role="status"
            aria-live="polite"
            className="flex shrink-0 items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm dark:bg-amber-600"
          >
            <WifiOff className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
            <span>Reconnecting…</span>
          </div>
        ) : null}

        <NotificationPermissionBanner />

        <div className="flex min-h-0 w-full flex-1 overflow-hidden">
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

        <ChatComposers />
      </div>
    </ChatStateProvider>
  );
};

export default ChatLayout;
