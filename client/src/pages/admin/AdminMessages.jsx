import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  MessagesSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Avatar from '../../components/common/Avatar.jsx';
import Badge from '../../components/common/Badge.jsx';
import ConfirmModal from '../../components/common/ConfirmModal.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import AdminTableSkeleton from '../../components/common/skeletons/AdminTableSkeleton.jsx';
import {
  forceDeleteMessage,
  getConversationMessages,
} from '../../api/admin.service.js';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * AdminMessages — moderator tool at `/admin/messages`.
 *
 * Why a "load by conversation id" tool instead of a global search box:
 *   The server intentionally exposes only a per-conversation audit
 *   endpoint (`/admin/conversations/:id/messages`) — every read is
 *   appended to `AdminAuditLog`, so admins cannot covertly browse
 *   private chats. A platform-wide message search would defeat that
 *   audit trail and turn the panel into a discovery tool. We
 *   compromise with an in-page text/sender filter that runs on the
 *   already-loaded page so admins can find what they need WITHIN the
 *   audit window without escaping it.
 *
 * Force-delete contract:
 *   - The same `forceDeleteMessage` endpoint admins call from the
 *     reports modal. The server emits `message:deleted` to all
 *     participants so their UIs redact in real time — we don't
 *     need to manually broadcast.
 *   - Optimistically marks the row as `deletedFor: 'everyone'` and
 *     clears its `text` / `imageUrl` so the redaction renders without
 *     waiting for a refetch.
 *
 * Deep-link:
 *   - `?id=<conversationId>` auto-loads the conversation. Other admin
 *     surfaces (reports modal, dashboard) link to this URL so a refresh
 *     never loses the audit context, and direct sharing of the URL
 *     between moderators is safe (every read still hits the audit log).
 */

const PAGE_SIZE = 30;
const CONVERSATION_ID_RE = /^[a-f0-9]{24}$/i;

const initialState = {
  loading: false,
  error: null,
  conversation: null,
  messages: [],
  page: 1,
  totalPages: 1,
  total: 0,
};

const AdminMessages = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get('id') ?? '';

  const [conversationIdInput, setConversationIdInput] = useState(initialId);
  const [activeConversationId, setActiveConversationId] = useState(
    CONVERSATION_ID_RE.test(initialId) ? initialId : '',
  );
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [state, setState] = useState(initialState);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  /* Keep the URL in sync with the active conversation so a refresh
   * preserves context and the URL can be shared between moderators. */
  useEffect(() => {
    const current = searchParams.get('id') ?? '';
    if (activeConversationId === current) return;
    const next = new URLSearchParams(searchParams);
    if (activeConversationId) {
      next.set('id', activeConversationId);
    } else {
      next.delete('id');
    }
    setSearchParams(next, { replace: true });
  }, [activeConversationId, searchParams, setSearchParams]);

  /* React to external URL changes (e.g. a moderator clicks an
   * "Audit conversation" link inside the reports modal). */
  useEffect(() => {
    const urlId = searchParams.get('id') ?? '';
    if (urlId === activeConversationId) return;
    if (CONVERSATION_ID_RE.test(urlId)) {
      setConversationIdInput(urlId);
      setFilter('');
      setPage(1);
      setActiveConversationId(urlId);
    } else if (!urlId && activeConversationId) {
      setConversationIdInput('');
      setActiveConversationId('');
      setState(initialState);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [searchParams]);

  const fetchPage = useCallback(async (conversationId, nextPage) => {
    if (!conversationId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await getConversationMessages(conversationId, {
        page: nextPage,
        limit: PAGE_SIZE,
      });
      const data = result?.data ?? {};
      setState({
        loading: false,
        error: null,
        conversation: data.conversation ?? null,
        messages: data.items ?? [],
        page: data.page ?? nextPage,
        totalPages: data.totalPages ?? 1,
        total: data.total ?? 0,
      });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        'Could not load messages. Check the conversation id.';
      setState({ ...initialState, error: message });
    }
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      fetchPage(activeConversationId, page);
    }
  }, [activeConversationId, page, fetchPage]);

  const handleLoad = (event) => {
    event.preventDefault();
    const trimmed = conversationIdInput.trim();
    if (!trimmed) return;
    if (!CONVERSATION_ID_RE.test(trimmed)) {
      toast.error('Conversation id must be 24 hexadecimal characters.');
      return;
    }
    setFilter('');
    setPage(1);
    setActiveConversationId(trimmed);
  };

  const handleClear = () => {
    setActiveConversationId('');
    setConversationIdInput('');
    setFilter('');
    setPage(1);
    setState(initialState);
  };

  const handleForceDelete = (message) => {
    setConfirm({
      title: 'Force-delete this message?',
      body: (
        <>
          <p>
            The bubble will be redacted for every participant in real
            time. The Cloudinary attachment (if any) is destroyed and
            cannot be restored.
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            This action is logged to the admin audit trail.
          </p>
        </>
      ),
      confirmLabel: 'Force-delete',
      variant: 'danger',
      onConfirm: async () => {
        setPendingDeleteId(message._id);
        try {
          await forceDeleteMessage(message._id);
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m._id === message._id
                ? { ...m, deletedFor: 'everyone', text: '', imageUrl: '' }
                : m,
            ),
          }));
          toast.success('Message force-deleted · Logged');
          setConfirm(null);
        } catch (err) {
          const message2 =
            err?.response?.data?.message || 'Could not delete message.';
          toast.error(message2);
          throw err;
        } finally {
          setPendingDeleteId(null);
        }
      },
    });
  };

  /* ---------- Derived ---------- */

  const filteredMessages = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return state.messages;
    return state.messages.filter((message) => {
      const text = (message.text || '').toLowerCase();
      const sender = message.sender;
      const username = (sender?.username || '').toLowerCase();
      const displayName = (sender?.displayName || '').toLowerCase();
      return (
        text.includes(needle) ||
        username.includes(needle) ||
        displayName.includes(needle)
      );
    });
  }, [filter, state.messages]);

  const summary = useMemo(() => {
    if (!activeConversationId) return 'Paste a conversation id to begin.';
    if (state.loading) return 'Loading messages…';
    if (state.total === 0) return 'No messages in this conversation.';
    return `Page ${state.page} of ${state.totalPages} · ${state.total} total messages`;
  }, [activeConversationId, state.loading, state.page, state.total, state.totalPages]);

  const goToPage = (next) => {
    if (next < 1 || next > state.totalPages || next === page) return;
    setPage(next);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Message moderation
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {summary}
          </p>
        </div>
        {activeConversationId ? (
          <button
            type="button"
            onClick={() => fetchPage(activeConversationId, page)}
            disabled={state.loading}
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        ) : null}
      </header>

      <form
        onSubmit={handleLoad}
        className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3 sm:flex-row sm:items-center dark:border-gray-800 dark:bg-gray-900/40"
      >
        <label className="flex-1">
          <span className="sr-only">Conversation id</span>
          <input
            type="text"
            value={conversationIdInput}
            onChange={(event) => setConversationIdInput(event.target.value)}
            placeholder="Paste a conversation id (24 hex characters)…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={
              !CONVERSATION_ID_RE.test(conversationIdInput.trim()) ||
              state.loading
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>Load messages</span>
          </button>
          {activeConversationId ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Clear
            </button>
          ) : null}
        </div>
      </form>

      {!activeConversationId ? (
        <EmptyState
          icon={MessagesSquare}
          title="Audit a conversation"
          description="Every message read here is logged to the admin audit trail. Force-deletion broadcasts a redaction to every participant in real time."
        />
      ) : state.loading ? (
        <AdminTableSkeleton rows={6} columns={4} />
      ) : state.error ? (
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load messages"
          description={state.error}
        />
      ) : (
        <>
          {state.conversation ? (
            <section
              aria-label="Conversation summary"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-800"
            >
              <Badge variant="neutral">{state.conversation.type}</Badge>
              <span className="font-medium text-gray-900 dark:text-white">
                {state.conversation.name ||
                  (state.conversation.type === 'group'
                    ? 'Untitled group'
                    : 'Direct chat')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                · {state.conversation.participantCount} participant
                {state.conversation.participantCount === 1 ? '' : 's'}
              </span>
            </section>
          ) : null}

          <label className="relative block">
            <span className="sr-only">Filter loaded messages</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter loaded messages by text or sender…"
              className="block w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>

          {filteredMessages.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title={filter ? 'No matches' : 'No messages on this page'}
              description={
                filter
                  ? 'Try a different keyword or clear the filter.'
                  : 'Try a different page.'
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-950">
              {filteredMessages.map((message) => (
                <MessageAuditRow
                  key={message._id}
                  message={message}
                  pending={pendingDeleteId === message._id}
                  onForceDelete={handleForceDelete}
                />
              ))}
            </ul>
          )}

          {state.totalPages > 1 ? (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between text-sm"
            >
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>Previous</span>
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {state.totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= state.totalPages}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </>
      )}

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        variant={confirm?.variant ?? 'danger'}
      >
        {confirm?.body}
      </ConfirmModal>
    </div>
  );
};

const MessageAuditRow = ({ message, pending, onForceDelete }) => {
  const sender = message.sender;
  const senderName = sender?.displayName || sender?.username || 'Deleted user';
  const isRedacted = message.deletedFor === 'everyone';
  const isSystem = message.type === 'system';

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Avatar src={sender?.avatarUrl} name={senderName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {senderName}
          </span>
          {sender?.username ? (
            <span className="text-xs text-gray-400">@{sender.username}</span>
          ) : null}
          <span className="text-xs text-gray-400">
            · {formatRelativeTime(message.createdAt)}
          </span>
          {isSystem ? <Badge variant="neutral">system</Badge> : null}
          {isRedacted ? <Badge variant="danger">redacted</Badge> : null}
          {message.editedAt ? (
            <span className="text-[11px] italic text-gray-400">edited</span>
          ) : null}
        </div>

        {isRedacted ? (
          <p className="mt-1 text-sm italic text-gray-400 dark:text-gray-500">
            This message has been deleted for everyone.
          </p>
        ) : (
          <>
            {message.text ? (
              <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-gray-700 dark:text-gray-200">
                {message.text}
              </p>
            ) : null}
            {message.imageUrl ? (
              <img
                src={message.imageUrl}
                alt="Message attachment"
                className="mt-2 max-h-48 rounded-md border border-gray-200 object-cover dark:border-gray-800"
              />
            ) : null}
            {!message.text && !message.imageUrl && !isSystem ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs italic text-gray-400">
                <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
                No content
              </p>
            ) : null}
          </>
        )}

        <p className="mt-1 font-mono text-[10px] text-gray-400 dark:text-gray-600">
          id: {message._id}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onForceDelete(message)}
        disabled={pending || isRedacted}
        title={
          isRedacted
            ? 'Already redacted'
            : 'Force-delete for everyone (logged)'
        }
        aria-label="Force-delete message"
        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
      >
        {pending ? (
          <span
            className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : (
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </li>
  );
};

export default AdminMessages;
