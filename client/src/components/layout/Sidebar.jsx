import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  Loader2,
  LogOut,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  Search,
  Settings as SettingsIcon,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import * as conversationService from '../../api/conversation.service.js';
import * as userService from '../../api/user.service.js';
import Avatar from '../common/Avatar.jsx';
import Badge from '../common/Badge.jsx';
import Spinner from '../common/Spinner.jsx';
import ConversationListItem from '../chat/ConversationListItem.jsx';
import PresenceDot from '../chat/PresenceDot.jsx';

/**
 * Sidebar — the conversation list on the left of `ChatLayout`.
 *
 * Architecture notes for this step (STEP 25):
 *   - State of the *list* lives in `ChatStateContext` (refetch, upsert,
 *     unread bumps). The Sidebar is the only consumer that wires socket
 *     events into those primitives — every other surface (chat panel,
 *     modals) just reads or upserts.
 *   - The search bar swaps the list mode entirely: typing queries the
 *     `/users/search` endpoint via a 300 ms debounce, and clicking a
 *     result opens (or creates) the direct conversation. We deliberately
 *     do NOT fuzzy-search conversations client-side — that scales
 *     poorly and surfaces stale data; a missing chat is one tap away
 *     via the user search instead.
 *   - The "+ New" menu opens the shared composer modals
 *     (`NewChatModal` / `NewGroupModal`) by toggling flags on
 *     `ChatStateContext`. The modals themselves live one level up in
 *     `ChatLayout` so the empty-state CTA can trigger the same flow
 *     without duplicating mounts.
 *   - Live socket listeners are scoped to this component because they
 *     only matter while the user is looking at `/chat/*`. `ChatLayout`
 *     unmounts the whole tree (and tears down the listeners with it)
 *     when the user navigates to `/settings` or `/u/...`.
 *
 * Why this file uses refs for `activeConversationId` and `currentUserId`:
 *   The socket listeners are registered once per `socket` instance.
 *   Re-binding them on every render would risk dropping events that
 *   land between detach + reattach. Refs let the stable handlers read
 *   current values without participating in the effect deps.
 */

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'archived', label: 'Archived' },
];

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const getOtherParticipant = (conversation, currentUserId) => {
  if (!conversation || !Array.isArray(conversation.participants)) return null;
  return (
    conversation.participants.find((p) => idOf(p) !== String(currentUserId)) ?? null
  );
};

const Sidebar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { socket, onlineUserIds } = useSocket();
  const {
    conversations,
    isLoading,
    error,
    refreshConversations,
    upsertConversation,
    removeConversation,
    incrementUnread,
    resetUnread,
    openNewChat,
    openNewGroup,
  } = useChatState();

  const activeMatch = useMatch('/chat/:conversationId');
  const activeConversationId = activeMatch?.params?.conversationId ?? null;

  const currentUserId = user?._id ? String(user._id) : null;
  const mutedSet = useMemo(
    () => new Set((user?.mutedConversations ?? []).map((id) => String(id))),
    [user?.mutedConversations],
  );

  /* ---------- Search ---------- */
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [creatingDirectId, setCreatingDirectId] = useState(null);

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    (async () => {
      try {
        const result = await userService.searchUsers(debouncedQuery, { limit: 8 });
        if (cancelled) return;
        setSearchResults(result?.data?.users ?? []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  /* ---------- Tabs (All / Unread / Archived) ---------- */
  const [activeTab, setActiveTab] = useState('all');
  const [archivedConversations, setArchivedConversations] = useState([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);

  useEffect(() => {
    if (activeTab !== 'archived') return undefined;
    let cancelled = false;
    setIsLoadingArchived(true);
    (async () => {
      try {
        const result = await conversationService.getConversations({
          archived: true,
          limit: 50,
        });
        if (cancelled) return;
        setArchivedConversations(result?.data?.items ?? []);
      } catch {
        if (!cancelled) setArchivedConversations([]);
      } finally {
        if (!cancelled) setIsLoadingArchived(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const visibleConversations = useMemo(() => {
    if (activeTab === 'archived') return archivedConversations;
    if (activeTab === 'unread') {
      return conversations.filter((c) => Number(c.unreadCount) > 0);
    }
    return conversations;
  }, [activeTab, archivedConversations, conversations]);

  /* ---------- "+ New" dropdown ---------- */
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef(null);
  useOnClickOutside(newMenuRef, () => setNewMenuOpen(false));

  /* ---------- Real-time wiring ----------
   * Refs keep the long-lived socket listeners pointing at the freshest
   * `activeConversationId` / `currentUserId` without re-subscribing on
   * every render. */
  const activeRef = useRef(activeConversationId);
  const userIdRef = useRef(currentUserId);
  useEffect(() => {
    activeRef.current = activeConversationId;
  }, [activeConversationId]);
  useEffect(() => {
    userIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleMessageNew = (message) => {
      if (!message?.conversationId) return;
      const conversationId = String(message.conversationId);
      const senderId = message?.sender?._id ? String(message.sender._id) : null;

      const lastMessage = {
        text: message.text ?? '',
        sender: message.sender ?? null,
        type: message.type ?? 'text',
        createdAt: message.createdAt ?? new Date().toISOString(),
      };

      upsertConversation({
        _id: conversationId,
        lastMessage,
        updatedAt: lastMessage.createdAt,
      });

      const isOwnMessage = senderId && senderId === userIdRef.current;
      const isActive = conversationId === activeRef.current;
      if (!isOwnMessage && !isActive) {
        incrementUnread(conversationId, 1);
      }
    };

    const handleReadBy = ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      if (String(userId) === userIdRef.current) {
        resetUnread(conversationId);
      }
    };

    const handleGroupCreated = ({ conversation }) => {
      if (!conversation?._id) return;
      upsertConversation(conversation);
    };

    const handleGroupUpdated = ({ conversationId, name, avatarUrl }) => {
      if (!conversationId) return;
      const patch = { _id: String(conversationId) };
      if (typeof name === 'string') patch.name = name;
      if (typeof avatarUrl === 'string') patch.avatarUrl = avatarUrl;
      upsertConversation(patch);
    };

    const handleMembershipChange = () => {
      // Member add/remove changes the participant list — easiest correct
      // behaviour is to refetch so the populated participant docs are
      // fresh (display name, avatar, presence flag).
      refreshConversations();
    };

    const handleYouWereRemoved = ({ conversationId }) => {
      if (!conversationId) return;
      removeConversation(conversationId);
      if (String(conversationId) === activeRef.current) {
        toast('You were removed from a group.', { icon: '⚠️' });
        navigate('/chat', { replace: true });
      }
    };

    socket.on('message:new', handleMessageNew);
    socket.on('conversation:readBy', handleReadBy);
    socket.on('group:created', handleGroupCreated);
    socket.on('group:updated', handleGroupUpdated);
    socket.on('group:memberAdded', handleMembershipChange);
    socket.on('group:memberRemoved', handleMembershipChange);
    socket.on('group:youWereRemoved', handleYouWereRemoved);

    return () => {
      socket.off('message:new', handleMessageNew);
      socket.off('conversation:readBy', handleReadBy);
      socket.off('group:created', handleGroupCreated);
      socket.off('group:updated', handleGroupUpdated);
      socket.off('group:memberAdded', handleMembershipChange);
      socket.off('group:memberRemoved', handleMembershipChange);
      socket.off('group:youWereRemoved', handleYouWereRemoved);
    };
  }, [
    socket,
    upsertConversation,
    incrementUnread,
    resetUnread,
    refreshConversations,
    removeConversation,
    navigate,
  ]);

  /* ---------- Handlers ---------- */
  const handleConversationClick = useCallback(
    (conversationId) => {
      // Optimistic local reset. Step 27 will fire the actual `markAsRead`
      // REST call and the server-driven `conversation:readBy` echo will
      // align everyone else's UI.
      resetUnread(conversationId);
    },
    [resetUnread],
  );

  const handleSearchResultClick = useCallback(
    async (target) => {
      if (!target?._id || creatingDirectId) return;
      setCreatingDirectId(String(target._id));
      try {
        const result = await conversationService.createDirect(target._id);
        const conversation = result?.data ?? null;
        if (!conversation?._id) {
          throw new Error('Conversation could not be opened');
        }
        upsertConversation(conversation);
        setQuery('');
        setSearchResults([]);
        navigate(`/chat/${conversation._id}`);
      } catch (err) {
        toast.error(err?.response?.data?.message || 'Could not open chat');
      } finally {
        setCreatingDirectId(null);
      }
    },
    [creatingDirectId, navigate, upsertConversation],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setSearchResults([]);
  }, []);

  /* ---------- Render helpers ---------- */
  const showSearchResults = debouncedQuery.length > 0;

  const renderListBody = () => {
    if (showSearchResults) {
      if (isSearching) {
        return (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" />
          </div>
        );
      }
      if (searchResults.length === 0) {
        return (
          <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            No users matched "{debouncedQuery}".
          </p>
        );
      }
      return (
        <ul className="space-y-1">
          {searchResults.map((target) => {
            const isCreating = creatingDirectId === String(target._id);
            const online = onlineUserIds.has(String(target._id));
            return (
              <li key={target._id}>
                <button
                  type="button"
                  disabled={Boolean(creatingDirectId)}
                  onClick={() => handleSearchResultClick(target)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-100 disabled:opacity-60 dark:hover:bg-gray-800"
                >
                  <span className="relative shrink-0">
                    <Avatar
                      src={target.avatarUrl}
                      name={target.displayName || target.username}
                      size="md"
                    />
                    {online ? (
                      <span className="absolute right-0 bottom-0">
                        <PresenceDot online size="sm" />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {target.displayName || target.username}
                    </span>
                    {target.username ? (
                      <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                        @{target.username}
                      </span>
                    ) : null}
                  </span>
                  {isCreating ? (
                    <Loader2
                      className="h-4 w-4 animate-spin text-gray-400"
                      aria-label="Opening chat"
                    />
                  ) : (
                    <UserPlus
                      className="h-4 w-4 text-gray-400 transition-colors group-hover:text-gray-600 dark:text-gray-500"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    if (activeTab === 'archived' && isLoadingArchived) {
      return (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      );
    }

    if (isLoading && conversations.length === 0) {
      return (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      );
    }

    if (error && conversations.length === 0) {
      return (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Couldn't load your conversations.
          </p>
          <button
            type="button"
            onClick={refreshConversations}
            className="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Try again
          </button>
        </div>
      );
    }

    if (visibleConversations.length === 0) {
      const emptyCopy = {
        all: 'No conversations yet. Start one with the "+ New" button.',
        unread: 'You\'re all caught up.',
        archived: 'No archived conversations.',
      }[activeTab];
      return (
        <p className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
          {emptyCopy}
        </p>
      );
    }

    return (
      <ul className="space-y-0.5">
        {visibleConversations.map((conversation) => {
          const conversationId = idOf(conversation);
          const isGroup = conversation.type === 'group';
          const other = isGroup ? null : getOtherParticipant(conversation, currentUserId);
          const isOnline = other ? onlineUserIds.has(String(other._id)) : false;
          return (
            <li key={conversationId}>
              <ConversationListItem
                conversation={conversation}
                to={`/chat/${conversationId}`}
                isActive={conversationId === activeConversationId}
                isMuted={mutedSet.has(conversationId)}
                otherParticipant={other}
                isGroup={isGroup}
                isOnline={isOnline}
                unreadCount={Number(conversation.unreadCount) || 0}
                onClick={() => handleConversationClick(conversationId)}
              />
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {/* Brand + actions */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
        <Link
          to="/chat"
          className="flex items-center gap-2 text-brand-700 transition-opacity hover:opacity-80 dark:text-brand-300"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
            Chats
          </span>
          {unreadCount > 0 ? (
            <Badge count={unreadCount} variant="danger" className="ml-1" />
          ) : null}
        </Link>

        <div className="flex items-center gap-1">
          <div className="relative" ref={newMenuRef}>
            <button
              type="button"
              onClick={() => setNewMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={newMenuOpen}
              className="flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New</span>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>

            {newMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNewMenuOpen(false);
                    openNewChat();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                  <span>New chat</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNewMenuOpen(false);
                    openNewGroup();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>New group</span>
                </button>
              </div>
            ) : null}
          </div>

          <Link
            to="/settings"
            aria-label="Settings"
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <SettingsIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Search users</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users by name or @username…"
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pr-8 pl-8 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:bg-gray-900"
            aria-label="Search users"
          />
          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      {/* Tabs (hidden while searching to avoid mode confusion) */}
      {!showSearchResults ? (
        <div
          role="tablist"
          aria-label="Conversation filter"
          className="flex items-center gap-1 border-b border-gray-200 px-3 pb-2 dark:border-gray-800"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* List body */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {renderListBody()}
      </div>

      {/* Current-user footer */}
      <div className="flex items-center gap-2 border-t border-gray-200 px-3 py-2 dark:border-gray-800">
        <Link
          to={user?.username ? `/u/${user.username}` : '/settings/profile'}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || user?.username}
            size="sm"
          />
          <span className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {user?.displayName || user?.username || 'You'}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => logout()}
          aria-label="Log out"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
