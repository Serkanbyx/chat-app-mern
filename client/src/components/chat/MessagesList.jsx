import {
  forwardRef,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { ArrowDown, MessageCircle } from 'lucide-react';

import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Spinner from '../common/Spinner.jsx';
import MessagesListSkeleton from '../common/skeletons/MessagesListSkeleton.jsx';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll.js';
import { groupConsecutiveBy } from '../../utils/helpers.js';
import { formatDaySeparator, isSameCalendarDay } from '../../utils/formatDate.js';

/**
 * MessagesList — middle scrollable region of the chat panel.
 *
 * Owns three responsibilities the parent shouldn't care about:
 *   1. Visual layout: day separators, sender grouping, system rows.
 *   2. Scroll behaviour:
 *      - Infinite scroll up (top sentinel → fetch older page).
 *      - Auto-stick to bottom when the user is already near it
 *        (within `STICK_THRESHOLD` pixels). Otherwise show the
 *        "↓ New messages" pill so reading older history is never
 *        interrupted.
 *      - One-shot scroll-to-bottom on initial mount + on outgoing
 *        sends (parent calls `scrollToBottom` via ref).
 *   3. Status display: top loader while paging, "Beginning of
 *      conversation" sentinel once `hasMore` is false.
 *
 * Rendering decisions:
 *   - `groupConsecutiveBy` annotates messages with `isGroupStart` /
 *     `isGroupEnd` so the bubble only shows the avatar + sender name
 *     on the first message of a run.
 *   - Day separators are inserted between two messages whose calendar
 *     day differs in the viewer's local timezone (see helper).
 *   - The TypingIndicator is rendered AFTER all bubbles so it always
 *     sits at the very bottom of the visible feed.
 *
 * Read-receipt computation (own messages only):
 *   - In a 1:1 chat the recipient set has one entry, so the tick is
 *     binary: 1 tick when unread, 2 ticks once they read.
 *   - In a group, we count how many recipients (everyone except the
 *     sender) appear in `readBy`. Three buckets:
 *       0          → 'sent'    (single tick)
 *       0 < x < N  → 'partial' (single tick + tooltip "Read by x/N")
 *       x === N    → 'read'    (double tick)
 *
 * Privacy:
 *   - "read" / "partial" ticks are downgraded to "sent" whenever the
 *     viewer disabled their own `showReadReceipts` preference. The
 *     server suppresses the `conversation:readBy` broadcast in that
 *     case too — this check is defence-in-depth against any cached
 *     state.
 *   - Tooltip strings expose ONLY counts (e.g. "Read by 2/4"); the
 *     identity of who read or didn't is never surfaced. Listing
 *     readers in a group would broadcast individual reading habits.
 */

const STICK_THRESHOLD = 100;

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

/**
 * Compute the `tickStatus` + `tickTooltip` for a message owned by the
 * viewer. Returns `{ status, tooltip }` so the bubble can pass them to
 * `MessageStatusTicks` directly. Caller is expected to skip this for
 * non-own messages — we still guard internally for safety.
 */
const computeReadSummary = (
  message,
  currentUserId,
  prefShowReceipts,
  recipientIdSet,
) => {
  if (message?._failed) return { status: 'failed', tooltip: '' };
  if (message?._pending) return { status: 'pending', tooltip: '' };

  const meId = String(currentUserId || '');
  const senderId = idOf(message?.sender);
  if (!meId || senderId !== meId) return { status: 'sent', tooltip: '' };
  if (!prefShowReceipts) return { status: 'sent', tooltip: '' };

  const totalRecipients = recipientIdSet?.size ?? 0;
  if (totalRecipients === 0) return { status: 'sent', tooltip: '' };

  const readers = Array.isArray(message?.readBy) ? message.readBy : [];
  let readCount = 0;
  const seen = new Set();
  for (const entry of readers) {
    const userId = idOf(entry?.user);
    if (!userId || userId === meId || seen.has(userId)) continue;
    if (recipientIdSet.has(userId)) {
      seen.add(userId);
      readCount += 1;
    }
  }

  if (readCount === 0) return { status: 'sent', tooltip: '' };
  if (readCount >= totalRecipients) return { status: 'read', tooltip: '' };
  return {
    status: 'partial',
    tooltip: `Read by ${readCount}/${totalRecipients}`,
  };
};

const MessagesList = forwardRef(
  (
    {
      messages = [],
      currentUserId,
      isGroup = false,
      isAdmin = false,
      participants = [],
      isLoadingInitial = false,
      isLoadingOlder = false,
      hasMore = false,
      onLoadOlder,
      typingUsers = [],
      showReadReceipts = true,
      onReply,
      onEdit,
      onDelete,
      onReact,
      onRetry,
    },
    ref,
  ) => {
    const containerRef = useRef(null);
    const isFirstRenderRef = useRef(true);
    const previousLastIdRef = useRef(null);

    /* `pendingNewCount` is non-zero only when a new message arrived
     * while the user was scrolled away from the bottom. Cleared the
     * moment they tap the pill or scroll back near the bottom. */
    const [pendingNewCount, setPendingNewCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const sentinelRef = useInfiniteScroll(
      useCallback(async () => {
        if (typeof onLoadOlder !== 'function') return;
        const el = containerRef.current;
        if (!el) {
          await onLoadOlder();
          return;
        }
        // Anchor the scroll position so prepending older messages
        // doesn't jump the viewport. We measure the distance from the
        // bottom (stable across content height changes) and restore it
        // after the parent has appended the new page.
        const distanceFromBottom = el.scrollHeight - el.scrollTop;
        await onLoadOlder();
        // Wait one frame so the DOM has reflowed with the new rows.
        requestAnimationFrame(() => {
          if (!el.isConnected) return;
          el.scrollTop = el.scrollHeight - distanceFromBottom;
        });
      }, [onLoadOlder]),
      { hasMore: hasMore && messages.length > 0, rootMargin: '120px' },
    );

    /* ---------- Scroll-position tracking ---------- */
    const measureBottom = useCallback(() => {
      const el = containerRef.current;
      if (!el) return true;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      return distance <= STICK_THRESHOLD;
    }, []);

    const handleScroll = useCallback(() => {
      const nearBottom = measureBottom();
      setIsAtBottom(nearBottom);
      if (nearBottom && pendingNewCount > 0) {
        setPendingNewCount(0);
      }
    }, [measureBottom, pendingNewCount]);

    /* ---------- Auto-scroll on new messages ----------
     * We diff the last message id between renders to detect "something
     * changed at the tail". If the user is still glued to the bottom,
     * we follow. Otherwise, we surface the "new messages" pill so the
     * user can opt in instead of being yanked away from older content. */
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const last = messages[messages.length - 1] ?? null;
      const lastId = idOf(last);
      const previousLastId = previousLastIdRef.current;

      if (isFirstRenderRef.current) {
        // First mount with content: jump (no smooth scroll) so the user
        // doesn't watch the timeline rewind from the top.
        if (lastId) {
          el.scrollTop = el.scrollHeight;
          previousLastIdRef.current = lastId;
          isFirstRenderRef.current = false;
        }
        return;
      }

      // Tail unchanged → nothing to do (older-page prepend handles its
      // own anchoring inside `useInfiniteScroll`'s callback).
      if (lastId === previousLastId) return;

      const isOwn =
        last && currentUserId && idOf(last.sender) === String(currentUserId);
      const wasNearBottom = measureBottom();

      if (isOwn || wasNearBottom) {
        // `requestAnimationFrame` so the freshly-appended bubble has
        // contributed to scrollHeight before we issue the scroll.
        requestAnimationFrame(() => {
          if (!el.isConnected) return;
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
        setPendingNewCount(0);
      } else {
        setPendingNewCount((prev) => prev + 1);
      }

      previousLastIdRef.current = lastId;
    }, [messages, currentUserId, measureBottom]);

    /* Reset tracking when the conversation switches. The parent (ChatPage)
     * unmounts and remounts on `:conversationId` change, so this is mostly
     * defensive — but cheap. */
    useEffect(() => {
      isFirstRenderRef.current = true;
      previousLastIdRef.current = null;
      setPendingNewCount(0);
    }, []);

    /* ---------- Imperative API for parent ---------- */
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom: ({ behavior = 'smooth' } = {}) => {
          const el = containerRef.current;
          if (!el) return;
          el.scrollTo({ top: el.scrollHeight, behavior });
          setPendingNewCount(0);
        },
        isNearBottom: () => measureBottom(),
      }),
      [measureBottom],
    );

    /* ---------- Derived view ---------- */
    const grouped = useMemo(() => groupConsecutiveBy(messages), [messages]);

    /* Memoize the recipient id Set so a 200-message timeline doesn't
     * rebuild it on every render. The Set is read-only — every consumer
     * that mutates would clone first. */
    const recipientIdSet = useMemo(() => {
      const meId = String(currentUserId || '');
      const set = new Set();
      for (const participant of participants ?? []) {
        const id = idOf(participant);
        if (!id || id === meId) continue;
        set.add(id);
      }
      return set;
    }, [participants, currentUserId]);

    const handlePillClick = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setPendingNewCount(0);
    }, []);

    /* ---------- Render ---------- */
    if (isLoadingInitial && messages.length === 0) {
      return (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
          <MessagesListSkeleton />
        </div>
      );
    }

    const showEmptyState = !isLoadingInitial && messages.length === 0;

    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="scrollbar-thin flex-1 overflow-y-auto bg-gray-50 px-2 py-3 dark:bg-gray-950"
        >
          {showEmptyState ? (
            <div className="flex h-full items-center justify-center px-4 py-8">
              <EmptyState
                icon={MessageCircle}
                title="No messages yet"
                description="Say hi to break the ice — your first message starts the conversation."
                className="border-transparent bg-transparent dark:border-transparent"
              />
            </div>
          ) : null}
          {/* Top sentinel: visible only when there's older history left. */}
          {hasMore ? (
            <div ref={sentinelRef} className="flex h-8 items-center justify-center">
              {isLoadingOlder ? <Spinner size="sm" /> : null}
            </div>
          ) : messages.length > 0 ? (
            <p className="px-3 py-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
              Beginning of conversation
            </p>
          ) : null}

          <ul className="flex flex-col gap-1.5">
            {grouped.map(({ message, isGroupStart, isGroupEnd }, index) => {
              const previousMessage = index > 0 ? grouped[index - 1].message : null;
              const showDaySeparator =
                !previousMessage ||
                !isSameCalendarDay(previousMessage.createdAt, message.createdAt);

              const isOwn =
                currentUserId && idOf(message.sender) === String(currentUserId);
              const { status: tickStatus, tooltip: tickTooltip } = isOwn
                ? computeReadSummary(
                    message,
                    currentUserId,
                    showReadReceipts,
                    recipientIdSet,
                  )
                : { status: 'sent', tooltip: '' };

              return (
                <Fragment key={message._id || message.clientTempId || index}>
                  {showDaySeparator ? (
                    <li className="flex justify-center py-2" aria-hidden="false">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-800">
                        {formatDaySeparator(message.createdAt)}
                      </span>
                    </li>
                  ) : null}

                  <li
                    className={clsx(
                      // Tighten spacing inside a same-sender run so the
                      // bubbles read as a visual group.
                      isGroupStart ? 'mt-1.5' : 'mt-0.5',
                      isGroupEnd ? 'mb-1' : 'mb-0',
                    )}
                  >
                    <MessageBubble
                      message={message}
                      isOwn={isOwn}
                      isGroup={isGroup}
                      isAdmin={isAdmin}
                      currentUserId={currentUserId}
                      showAvatar={!isOwn && isGroupEnd}
                      showName={!isOwn && isGroupStart}
                      tickStatus={tickStatus}
                      tickTooltip={tickTooltip}
                      onReply={onReply}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onReact={onReact}
                      onRetry={onRetry}
                    />
                  </li>
                </Fragment>
              );
            })}
          </ul>

          {typingUsers.length > 0 ? (
            <div className="mt-2">
              <TypingIndicator users={typingUsers} />
            </div>
          ) : null}
        </div>

        {!isAtBottom && pendingNewCount > 0 ? (
          <button
            type="button"
            onClick={handlePillClick}
            className="absolute right-4 bottom-4 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition-transform hover:scale-105 dark:bg-brand-500"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {pendingNewCount} new message{pendingNewCount === 1 ? '' : 's'}
            </span>
          </button>
        ) : null}
      </div>
    );
  },
);

MessagesList.displayName = 'MessagesList';

export default memo(MessagesList);
