import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as conversationService from '../api/conversation.service.js';
import { useAuth } from './AuthContext.jsx';

/**
 * ChatStateContext — owns the *client-side* projection of the user's
 * conversation list while they are on the chat surface.
 *
 * Why a dedicated context (vs. lifting state into `ChatLayout`):
 *   - Sibling consumers (`Sidebar`, the active `ChatPage`, modals
 *     opened from the empty state) all need to read AND write the
 *     same list. Threading callbacks through the layout would
 *     re-render the whole tree on every socket event.
 *   - Socket listeners registered in Step 25 will call
 *     `upsertConversation` from outside the React tree (well, from a
 *     hook), and the context exposes a referentially-stable function
 *     so those subscriptions don't churn.
 *
 * What this context deliberately does NOT do:
 *   - It does not own messages — that's the chat page's concern (Step
 *     27). Each conversation row only carries the small `lastMessage`
 *     preview the server includes in the list payload.
 *   - It does not duplicate the global unread badge — that lives in
 *     `NotificationContext`. The per-conversation `unreadCount` field
 *     here is a UI hint scoped to the sidebar.
 *
 * Bootstrap rules:
 *   - The first fetch is gated behind `isAuthenticated` so we never
 *     call `/conversations` with a missing token.
 *   - A `bootstrappedRef` guard prevents React 18 strict-mode double
 *     mount from issuing two parallel GETs (mirrors AuthContext).
 *   - Logging out resets the cache so a different user signing in on
 *     the same tab can't briefly see the previous user's chats.
 */

const ChatStateContext = createContext(null);

/* Most-recent first. We tolerate either `updatedAt` (the canonical
 * field) or `lastMessageAt` so socket payloads with only one of the
 * two can still slot in correctly. */
const sortByRecency = (a, b) => {
  const ta = new Date(a.updatedAt ?? a.lastMessageAt ?? 0).getTime();
  const tb = new Date(b.updatedAt ?? b.lastMessageAt ?? 0).getTime();
  return tb - ta;
};

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

export const ChatStateProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);

  /**
   * Composer modal state.
   *
   * `NewChatModal` and `NewGroupModal` are mounted *once* at the layout
   * level and toggled via the context. Two surfaces trigger them today
   * (`Sidebar`'s "+ New" dropdown and `EmptyChatPage`'s CTA), and Step
   * 30+ will wire group settings panels into the same primitives.
   * Centralising the open/close flags here means each trigger stays a
   * one-liner and the modals can never be double-mounted.
   */
  const [activeComposer, setActiveComposer] = useState(null);

  const bootstrappedRef = useRef(false);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await conversationService.getConversations();
      const items = result?.data?.items ?? [];
      setConversations([...items].sort(sortByRecency));
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      bootstrappedRef.current = false;
      setConversations([]);
      setActiveConversationId(null);
      setActiveComposer(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    fetchConversations();
  }, [isAuthenticated, fetchConversations]);

  const openNewChat = useCallback(() => setActiveComposer('chat'), []);
  const openNewGroup = useCallback(() => setActiveComposer('group'), []);
  const closeComposer = useCallback(() => setActiveComposer(null), []);

  /**
   * Insert OR update a conversation in place, keeping the list sorted
   * by recency. Existing fields are preserved when the incoming
   * payload is a partial update (e.g. socket-pushed `lastMessage` only)
   * — full server payloads naturally overwrite everything.
   */
  const upsertConversation = useCallback((incoming) => {
    if (!incoming || !incoming._id) return;
    setConversations((prev) => {
      const id = idOf(incoming);
      const existing = prev.find((c) => idOf(c) === id);
      const merged = existing ? { ...existing, ...incoming } : incoming;
      const others = prev.filter((c) => idOf(c) !== id);
      return [merged, ...others].sort(sortByRecency);
    });
  }, []);

  const removeConversation = useCallback((id) => {
    if (!id) return;
    const target = idOf(id);
    setConversations((prev) => prev.filter((c) => idOf(c) !== target));
    setActiveConversationId((prev) => (prev === target ? null : prev));
  }, []);

  /**
   * Per-conversation unread helpers — small, specific primitives that
   * spare consumers from juggling `setConversations` themselves. The
   * sidebar bumps unread on every incoming `message:new` (when the
   * conversation isn't focused) and resets it the moment the user opens
   * the chat (Step 27 will also reset on `conversation:readBy` for the
   * current user).
   */
  const incrementUnread = useCallback((id, by = 1) => {
    if (!id) return;
    const target = idOf(id);
    setConversations((prev) =>
      prev.map((c) =>
        idOf(c) === target
          ? { ...c, unreadCount: Math.max(0, Number(c.unreadCount) || 0) + by }
          : c,
      ),
    );
  }, []);

  const resetUnread = useCallback((id) => {
    if (!id) return;
    const target = idOf(id);
    setConversations((prev) =>
      prev.map((c) => (idOf(c) === target ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      isLoading,
      error,
      activeConversationId,
      setActiveConversationId,
      upsertConversation,
      removeConversation,
      incrementUnread,
      resetUnread,
      refreshConversations: fetchConversations,
      activeComposer,
      isNewChatOpen: activeComposer === 'chat',
      isNewGroupOpen: activeComposer === 'group',
      openNewChat,
      openNewGroup,
      closeComposer,
    }),
    [
      conversations,
      isLoading,
      error,
      activeConversationId,
      upsertConversation,
      removeConversation,
      incrementUnread,
      resetUnread,
      fetchConversations,
      activeComposer,
      openNewChat,
      openNewGroup,
      closeComposer,
    ],
  );

  return <ChatStateContext.Provider value={value}>{children}</ChatStateContext.Provider>;
};

export const useChatState = () => {
  const ctx = useContext(ChatStateContext);
  if (!ctx) {
    throw new Error('useChatState must be used within a <ChatStateProvider>');
  }
  return ctx;
};

export default ChatStateContext;
