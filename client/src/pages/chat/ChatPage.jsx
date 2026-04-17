import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import ChatHeader from '../../components/chat/ChatHeader.jsx';
import MessageComposer from '../../components/chat/MessageComposer.jsx';
import MessagesList from '../../components/chat/MessagesList.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import * as conversationService from '../../api/conversation.service.js';
import * as messageService from '../../api/message.service.js';

/**
 * ChatPage — single conversation surface mounted at
 * `/chat/:conversationId`.
 *
 * Architectural responsibilities (the components below stay
 * presentational on purpose):
 *   - Resolve `:conversationId` to a populated conversation document
 *     (`conversationService.getConversation`) and the first page of
 *     messages (`messageService.getMessages`, limit=30).
 *   - Wire the live socket events for THIS conversation only:
 *       `message:new`, `message:edited`, `message:deleted`,
 *       `message:reactionUpdated`, `conversation:readBy`.
 *   - Drive the "active conversation" lifecycle for both the global
 *     notification suppression context AND the server-side viewer
 *     refcount (`conversation:open` / `conversation:close`).
 *   - Mark the conversation as read on mount AND whenever a new
 *     message arrives while the user is focused.
 *
 * Why this file owns its own message cache (instead of a context):
 *   The messages array is naturally scoped to this route. Hoisting it
 *   to a long-lived context would mean either dropping it on navigate
 *   (defeating the cache) or keeping every conversation's history in
 *   memory (a leak, especially with images). A per-mount cache is the
 *   simplest correct strategy.
 *
 * Realtime / REST handshake:
 *   The bottom REST `markAsRead` is fired on mount AND inside the
 *   `message:new` handler for new traffic that landed while the user
 *   was already focused. The corresponding `conversation:read` socket
 *   event is also emitted so the server can broadcast the
 *   `conversation:readBy` echo without waiting for the REST round-trip.
 */

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const ChatPage = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const { socket, emit, typingByConversation } = useSocket();
  const { setActiveConversationId: setNotificationActive } = useNotifications();
  const {
    setActiveConversationId,
    upsertConversation,
    resetUnread,
    removeConversation,
  } = useChatState();

  const currentUserId = user?._id ? String(user._id) : null;

  /* ---------- Local cache for THIS conversation ---------- */
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  /* `replyTo` lives on the page (not the composer) so that the eventual
   * "reply" affordance on `MessageBubble` (Step 29) only has to call
   * `setReplyTo(message)` to wire the composer's quoted preview. */
  const [replyTo, setReplyTo] = useState(null);

  const listRef = useRef(null);

  /* Refs let socket handlers (registered once per socket+conv pair) read
   * the freshest messages array without forcing the listener subscription
   * to churn — losing events between detach and reattach is the bug
   * we're avoiding. */
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /* ---------- Reset state every time the conversation changes ---------- */
  useEffect(() => {
    setConversation(null);
    setMessages([]);
    setHasMore(false);
    setError(null);
    setIsLoadingInitial(true);
    setIsLoadingOlder(false);
    setReplyTo(null);
  }, [conversationId]);

  /* ---------- Initial fetch (conversation + first page) ----------
   * Runs in parallel; either failure aborts the page with a toast.
   * The `cancelled` guard prevents a stale response from a previous
   * conversation from overwriting the new one's state. */
  useEffect(() => {
    if (!conversationId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const [convResult, msgResult] = await Promise.all([
          conversationService.getConversation(conversationId),
          messageService.getMessages(conversationId, { limit: 30 }),
        ]);
        if (cancelled) return;

        const convDoc = convResult?.data ?? null;
        const items = msgResult?.data?.items ?? [];
        const more = Boolean(msgResult?.data?.hasMore);

        if (!convDoc) {
          throw new Error('Conversation not found');
        }

        setConversation(convDoc);
        setMessages(items);
        setHasMore(more);
        upsertConversation({ ...convDoc, unreadCount: 0 });
        setActiveConversationId(idOf(convDoc));
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        setError(err);
        if (status === 404 || status === 403) {
          toast.error('Conversation is no longer available');
          removeConversation(conversationId);
          navigate('/chat', { replace: true });
        } else {
          toast.error(err?.response?.data?.message || 'Could not open conversation');
        }
      } finally {
        if (!cancelled) setIsLoadingInitial(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    navigate,
    removeConversation,
    setActiveConversationId,
    upsertConversation,
  ]);

  /* ---------- Active-conversation lifecycle ----------
   * Tells:
   *   - NotificationContext to suppress in-app/native alerts for
   *     messages in THIS conversation while it's focused.
   *   - The server (via `conversation:open`) to suppress its own
   *     `notification:new` fan-out. Critical so the user's other
   *     devices stay quiet too.
   *   - Resets the unread counter the moment the user opens the chat
   *     (REST + socket equivalents — the socket call is the source of
   *     truth, the REST is the fallback). */
  useEffect(() => {
    if (!conversationId) return undefined;
    setNotificationActive(conversationId);
    setActiveConversationId(conversationId);
    resetUnread(conversationId);

    emit('conversation:open', { conversationId });
    emit('conversation:read', { conversationId });
    // REST fallback so the unread counter is reset even if the socket
    // is disconnected. Errors here are non-fatal; we deliberately
    // swallow them so the chat surface still works offline.
    conversationService.markAsRead(conversationId).catch(() => {});

    return () => {
      emit('conversation:close', { conversationId });
      setNotificationActive((current) =>
        current === conversationId ? null : current,
      );
      setActiveConversationId((current) =>
        current === conversationId ? null : current,
      );
    };
  }, [
    conversationId,
    emit,
    resetUnread,
    setActiveConversationId,
    setNotificationActive,
  ]);

  /* ---------- Page focus / visibility re-read ----------
   * If the user backgrounded the tab and comes back, re-mark the
   * conversation as read so any unread bubbles that arrived while the
   * tab was hidden don't linger as "new" on either side. */
  useEffect(() => {
    if (!conversationId) return undefined;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      emit('conversation:read', { conversationId });
      conversationService.markAsRead(conversationId).catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [conversationId, emit]);

  /* ---------- Realtime wiring ----------
   * One subscription per (socket, conversationId) pair. We filter every
   * payload by `conversationId` so cross-conversation events from the
   * shared `socket` instance never pollute this view. */
  useEffect(() => {
    if (!socket || !conversationId) return undefined;

    const handleMessageNew = (incoming) => {
      if (!incoming || String(incoming.conversationId) !== conversationId) return;

      setMessages((prev) => {
        const tempId = incoming.clientTempId;
        if (tempId) {
          // Reconcile with any optimistic placeholder the composer
          // pushed in (Step 28). We MERGE the optimistic flags into the
          // server payload so a retry-on-failure path can flip _pending
          // back if needed.
          const replaceIdx = prev.findIndex(
            (m) => m.clientTempId && m.clientTempId === tempId,
          );
          if (replaceIdx !== -1) {
            const next = prev.slice();
            next[replaceIdx] = { ...incoming, _pending: false };
            return next;
          }
        }

        // Plain dedupe by server _id (the originating REST controller
        // also broadcasts via socket; our originating tab dedupes here).
        if (incoming._id && prev.some((m) => m._id === incoming._id)) {
          return prev;
        }
        return [...prev, incoming];
      });

      // Mark as read whenever a new message arrives while we're focused
      // on the conversation, but skip our own messages.
      const senderId = idOf(incoming.sender);
      if (senderId !== currentUserId) {
        emit('conversation:read', { conversationId });
        conversationService.markAsRead(conversationId).catch(() => {});
      }
    };

    const handleMessageEdited = (incoming) => {
      if (!incoming || String(incoming.conversationId) !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === incoming._id ? { ...m, ...incoming } : m)),
      );
    };

    const handleMessageDeleted = ({ conversationId: cid, messageId, for: scope }) => {
      if (!cid || String(cid) !== conversationId) return;
      if (scope === 'self') {
        // Per-user tombstone — drop the row entirely from this view.
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
        return;
      }
      // 'everyone' — keep the row but flip it to the deleted state so
      // the bubble can render "This message was deleted" in place.
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? { ...m, deletedFor: 'everyone', text: '', imageUrl: '' }
            : m,
        ),
      );
    };

    const handleReactionUpdated = ({ messageId, conversationId: cid, reactions }) => {
      if (!cid || String(cid) !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)),
      );
    };

    const handleReadBy = ({ conversationId: cid, userId, readAt }) => {
      if (!cid || String(cid) !== conversationId) return;
      // Patch every own message so the ticks upgrade to ✓✓ for the new
      // reader. We avoid duplicate readBy entries for the same user.
      setMessages((prev) =>
        prev.map((m) => {
          if (idOf(m.sender) !== currentUserId) return m;
          const readers = Array.isArray(m.readBy) ? m.readBy : [];
          if (readers.some((entry) => idOf(entry.user) === String(userId))) return m;
          return { ...m, readBy: [...readers, { user: userId, at: readAt }] };
        }),
      );
    };

    socket.on('message:new', handleMessageNew);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:reactionUpdated', handleReactionUpdated);
    socket.on('conversation:readBy', handleReadBy);

    return () => {
      socket.off('message:new', handleMessageNew);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:reactionUpdated', handleReactionUpdated);
      socket.off('conversation:readBy', handleReadBy);
    };
  }, [conversationId, currentUserId, emit, socket]);

  /* ---------- Optimistic-send wiring (consumed by MessageComposer) ----------
   * We keep these helpers here (rather than passing `setMessages` down)
   * so the composer's prop surface stays narrow and so future
   * consumers — e.g. a "retry failed message" button on the bubble —
   * can call the same primitives without re-implementing the dedupe
   * rules. */
  const handleOptimisticAdd = useCallback((message) => {
    if (!message || !message.clientTempId) return;
    setMessages((prev) => {
      // Defensive: a duplicate clientTempId would only happen with a
      // double-submit; the second one wins so the older spinner can't
      // get stranded.
      const filtered = prev.filter(
        (m) => m.clientTempId !== message.clientTempId,
      );
      return [...filtered, message];
    });
  }, []);

  const handleOptimisticUpdate = useCallback((clientTempId, patch) => {
    if (!clientTempId || !patch) return;
    setMessages((prev) =>
      prev.map((m) => (m.clientTempId === clientTempId ? { ...m, ...patch } : m)),
    );
  }, []);

  const handleAfterSend = useCallback(() => {
    // The composer fires this immediately after dispatching the
    // optimistic bubble. Snap the timeline to the bottom so the user
    // always sees their own message land, regardless of where they
    // were scrolled before hitting Send.
    listRef.current?.scrollToBottom?.({ behavior: 'smooth' });
  }, []);

  const handleCancelReply = useCallback(() => setReplyTo(null), []);

  /* ---------- Composer disabled-state derivation ----------
   * Mirrors the server's write-side guards so the textarea reflects
   * reality before the user types into it. The server is still the
   * authority — these flags are UX hints. */
  const composerDisabled =
    !conversationId ||
    isLoadingInitial ||
    Boolean(error) ||
    conversation?.isActive === false;
  const composerDisabledReason = !conversation?.isActive
    ? 'This conversation is no longer active.'
    : '';

  /* ---------- Older-page fetch (called by MessagesList sentinel) ---------- */
  const handleLoadOlder = useCallback(async () => {
    if (!conversationId || isLoadingOlder || !hasMore) return;
    const oldest = messagesRef.current[0];
    if (!oldest?._id) return;

    setIsLoadingOlder(true);
    try {
      const result = await messageService.getMessages(conversationId, {
        before: oldest._id,
        limit: 30,
      });
      const items = result?.data?.items ?? [];
      const more = Boolean(result?.data?.hasMore);
      setMessages((prev) => {
        if (items.length === 0) return prev;
        // Server sends OLDER messages in chronological order; prepend
        // and dedupe defensively against any overlap from concurrent
        // socket events.
        const seen = new Set(prev.map((m) => m._id).filter(Boolean));
        const fresh = items.filter((m) => !m._id || !seen.has(m._id));
        return [...fresh, ...prev];
      });
      setHasMore(more);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load older messages');
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, hasMore, isLoadingOlder]);

  /* ---------- Typing users for THIS conversation ---------- */
  const typingUsers = useMemo(() => {
    if (!conversationId) return [];
    const ids = typingByConversation.get(conversationId);
    if (!ids || ids.size === 0) return [];

    const participants = conversation?.participants ?? [];
    const list = [];
    for (const userId of ids) {
      if (String(userId) === currentUserId) continue;
      const found = participants.find((p) => idOf(p) === String(userId));
      list.push(
        found ?? { _id: userId, displayName: 'Someone', username: 'someone' },
      );
    }
    return list;
  }, [conversationId, conversation, currentUserId, typingByConversation]);

  /* ---------- Render ---------- */
  if (error && !conversation && !isLoadingInitial) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          We couldn't open this conversation.
        </p>
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
        >
          Back to conversations
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white dark:bg-gray-900">
      <ChatHeader
        conversation={conversation}
        isLoading={isLoadingInitial}
      />

      <MessagesList
        ref={listRef}
        messages={messages}
        currentUserId={currentUserId}
        isGroup={conversation?.type === 'group'}
        isLoadingInitial={isLoadingInitial}
        isLoadingOlder={isLoadingOlder}
        hasMore={hasMore}
        onLoadOlder={handleLoadOlder}
        typingUsers={typingUsers}
        showReadReceipts={preferences?.showReadReceipts !== false}
      />

      <MessageComposer
        conversationId={conversationId}
        replyTo={replyTo}
        onCancelReply={handleCancelReply}
        onOptimisticAdd={handleOptimisticAdd}
        onOptimisticUpdate={handleOptimisticUpdate}
        onAfterSend={handleAfterSend}
        disabled={composerDisabled}
        disabledReason={composerDisabledReason}
      />
    </div>
  );
};

export default ChatPage;
