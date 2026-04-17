import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Copy,
  CornerUpLeft,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Smile,
  Trash2,
} from 'lucide-react';

import Avatar from '../common/Avatar.jsx';
import Modal from '../common/Modal.jsx';
import Spinner from '../common/Spinner.jsx';
import ImageLightbox from './ImageLightbox.jsx';
import MessageStatusTicks from './MessageStatusTicks.jsx';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import { formatClockTime, linkifyText } from '../../utils/helpers.js';

/**
 * MessageBubble — render a single message row inside the timeline.
 *
 * Owns three interactive surfaces the parent does NOT touch:
 *   1. The hover / long-press action menu (Reply, Copy, React, Edit,
 *      Delete) and its mini emoji bar for quick reactions.
 *   2. The inline edit affordance (Save / Cancel within a 15-minute
 *      window — the server is the authority, this is UX).
 *   3. The "Delete for me / for everyone" confirmation modal, with
 *      eligibility for "for everyone" gated by sender + 5-min window OR
 *      admin role (the server re-checks; we hide the option as UX).
 *
 * Inputs the parent (MessagesList) computes:
 *   - `isOwn`          — message is from the viewer (right-aligned).
 *   - `showAvatar`     — render avatar slot (suppressed on grouped
 *                        continuation bubbles).
 *   - `showName`       — render the sender's display name above the
 *                        bubble (groups only, only on the first bubble
 *                        of a same-sender run).
 *   - `tickStatus`     — 'pending' | 'sent' | 'partial' | 'read' |
 *                        'failed', already gated by the viewer's
 *                        `showReadReceipts` preference.
 *   - `tickTooltip`    — optional string for partial reads
 *                        ("Read by 2/4"); never lists user names.
 *   - `currentUserId`  — viewer id; used to compute reaction-toggle
 *                        affordances and "is this MY reaction?" styles.
 *   - `isAdmin`        — viewer has the `admin` role (delete-for-everyone
 *                        is always permitted; we re-check on the server).
 *   - `isGroup`        — surface sender display names + read tooltip.
 *   - Action callbacks — `onReply`, `onEdit`, `onDelete`, `onReact`,
 *                        `onRetry`. Each returns a Promise so the bubble
 *                        can show its in-flight state without owning the
 *                        message cache.
 *
 * SECURITY:
 *   - Body text is rendered via React JSX (auto-escaped). URLs are
 *     tokenised by `linkifyText` which only emits `<a>` for `http(s)://`
 *     schemes; everything else stays plain text — no `javascript:` /
 *     `data:` / `file:` / `vbscript:` link can ever be produced.
 *   - The image click-to-zoom uses a fixed sandbox lightbox component:
 *     no link extraction from the URL, the same vetted `imageUrl` is
 *     reused as the `<img src>`.
 *   - `referrerPolicy="no-referrer"` and `loading="lazy"` on every
 *     image so the recipient's session doesn't leak referers and
 *     off-screen photos don't pre-load.
 *   - Edit / delete eligibility is shown by the menu purely as UX. The
 *     server re-validates on every mutation (sender + window for edit,
 *     sender + window OR admin for delete-for-everyone).
 *   - Tooltip for partial group reads shows ONLY counts; we never list
 *     which users have or haven't read (privacy).
 */

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_WINDOW_MS = 5 * 60 * 1000;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const LONG_PRESS_MS = 450;

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

/* React-friendly key for linkified tokens. We never use the token text
 * as a key by itself because two identical URLs in one message would
 * produce duplicate keys; index suffix solves that without losing the
 * stability React wants. */
const renderLinkified = (text) =>
  linkifyText(text).map((token, index) => {
    if (token.type === 'link') {
      return (
        <a
          key={`l-${index}`}
          href={token.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all underline decoration-1 underline-offset-2 hover:opacity-80"
        >
          {token.label}
        </a>
      );
    }
    return <span key={`t-${index}`}>{token.value}</span>;
  });

const SystemBubble = ({ message }) => (
  <div className="flex justify-center px-2 py-1">
    <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] italic text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
      {message.text || 'Conversation updated'}
    </span>
  </div>
);

const DeletedBubble = ({ isOwn }) => (
  <span
    className={clsx(
      'inline-flex items-center rounded-2xl px-3 py-2 text-sm italic',
      isOwn
        ? 'bg-brand-50 text-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    )}
  >
    This message was deleted
  </span>
);

/* ------------------------------------------------------------------ *
 * Reply quote — compact preview surfaced above the bubble body when   *
 * the message has a populated `replyTo`. Clicking the quote does not  *
 * scroll-to-original yet (Step 30 territory); we keep it presentational *
 * so adding the navigation later is a one-line callback wire.          *
 * ------------------------------------------------------------------ */
const ReplyQuote = ({ replyTo, isOwn }) => {
  const senderName =
    replyTo?.sender?.displayName || replyTo?.sender?.username || 'Unknown';
  const isImage = replyTo?.type === 'image';
  const preview = isImage
    ? replyTo?.text || 'Photo'
    : (replyTo?.text || '').replace(/\s+/g, ' ').trim();

  return (
    <div
      className={clsx(
        'mb-1 flex max-w-full items-stretch gap-2 rounded-lg px-2 py-1.5 text-[11px]',
        isOwn
          ? 'bg-brand-700/30 text-white/90'
          : 'bg-gray-200/80 text-gray-700 dark:bg-gray-700/70 dark:text-gray-200',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'w-0.5 shrink-0 rounded-full',
          isOwn ? 'bg-white/60' : 'bg-brand-500',
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            'truncate text-[11px] font-semibold',
            isOwn ? 'text-white' : 'text-brand-600 dark:text-brand-300',
          )}
        >
          {senderName}
        </p>
        <p className="flex items-center gap-1 truncate">
          {isImage ? (
            <ImageIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : null}
          <span className="truncate">{preview || 'Message'}</span>
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Reaction chips — emoji buckets aggregated from `message.reactions`. *
 * Click toggles the viewer's reaction (server enforces the one-per-   *
 * user rule, so re-clicking the same emoji removes it).               *
 * ------------------------------------------------------------------ */
const ReactionChips = ({ reactions, currentUserId, onToggle, disabled }) => {
  const buckets = useMemo(() => {
    if (!Array.isArray(reactions) || reactions.length === 0) return [];
    const map = new Map();
    for (const entry of reactions) {
      const emoji = entry?.emoji;
      if (!emoji) continue;
      const userId = idOf(entry?.user);
      const existing = map.get(emoji);
      if (existing) {
        existing.count += 1;
        if (userId === String(currentUserId)) existing.mine = true;
      } else {
        map.set(emoji, {
          emoji,
          count: 1,
          mine: userId === String(currentUserId),
        });
      }
    }
    return Array.from(map.values());
  }, [reactions, currentUserId]);

  if (buckets.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {buckets.map((bucket) => (
        <button
          key={bucket.emoji}
          type="button"
          disabled={disabled}
          onClick={() => onToggle?.(bucket.emoji)}
          aria-label={`${bucket.mine ? 'Remove' : 'Add'} ${bucket.emoji} reaction`}
          aria-pressed={bucket.mine}
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-none transition-colors',
            'tabular-nums',
            bucket.mine
              ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-500/40'
              : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <span className="text-sm leading-none">{bucket.emoji}</span>
          <span>{bucket.count}</span>
        </button>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Action menu popover — Reply / Copy / React / Edit / Delete.         *
 * Visibility is controlled by the bubble's `menuOpen` state. We mount  *
 * unconditionally so a hover-to-reveal MoreHorizontal button + a       *
 * long-press both flip the same state.                                 *
 * ------------------------------------------------------------------ */
const BubbleMenu = ({
  open,
  onClose,
  isOwn,
  canReply,
  canCopy,
  canEdit,
  canDelete,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onPickEmoji,
}) => {
  const containerRef = useRef(null);
  useOnClickOutside(
    containerRef,
    useCallback(() => {
      if (open) onClose?.();
    }, [open, onClose]),
  );

  if (!open) return null;

  const ItemButton = ({ icon: Icon, label, onClick, danger = false, disabled }) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick?.();
        onClose?.();
      }}
      disabled={disabled}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label="Message actions"
      className={clsx(
        'absolute z-20 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900',
        // Anchor under the trigger; flip side based on bubble alignment.
        isOwn ? 'right-0 top-full mt-1' : 'left-0 top-full mt-1',
      )}
    >
      {/* Quick-react row. The chosen emoji reacts immediately (toggle) — */}
      {/* opening the full picker would be heavy for a 6-emoji shortcut. */}
      <div className="flex items-center justify-between gap-1 border-b border-gray-100 px-2 py-1.5 dark:border-gray-800">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onPickEmoji?.(emoji);
              onClose?.();
            }}
            aria-label={`React with ${emoji}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base leading-none transition-transform hover:scale-125 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="py-1">
        {canReply ? (
          <ItemButton icon={CornerUpLeft} label="Reply" onClick={onReply} />
        ) : null}
        {canCopy ? <ItemButton icon={Copy} label="Copy text" onClick={onCopy} /> : null}
        {canEdit ? <ItemButton icon={Pencil} label="Edit" onClick={onEdit} /> : null}
        {canDelete ? (
          <ItemButton icon={Trash2} label="Delete" onClick={onDelete} danger />
        ) : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Inline editor — replaces the bubble body with a textarea + buttons. *
 * Enter saves, Shift+Enter inserts a newline, Escape cancels.         *
 * ------------------------------------------------------------------ */
const InlineEditor = ({ initialText, isOwn, isSubmitting, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initialText);
  const textareaRef = useRef(null);

  /* Auto-size + focus the textarea on mount. `useLayoutEffect` so the
   * size lands before paint and the caret jumps to the end without a
   * visible flash. */
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const length = el.value.length;
    el.setSelectionRange(length, length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  const handleChange = useCallback((event) => {
    setDraft(event.target.value);
    const el = event.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
        event.preventDefault();
        onSave?.(draft);
      }
    },
    [draft, onCancel, onSave],
  );

  const trimmed = draft.trim();
  const unchanged = trimmed === (initialText || '').trim();
  const canSave = !isSubmitting && trimmed.length > 0 && !unchanged;

  return (
    <div
      className={clsx(
        'flex w-full max-w-md flex-col gap-2 rounded-2xl px-3 py-2 text-sm shadow-sm',
        isOwn
          ? 'rounded-br-sm bg-brand-600 text-white'
          : 'rounded-bl-sm bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
      )}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        maxLength={4000}
        aria-label="Edit message"
        className={clsx(
          'scrollbar-thin w-full resize-none border-0 bg-transparent text-sm focus:outline-none focus:ring-0',
          isOwn
            ? 'placeholder-white/60 text-white'
            : 'placeholder-gray-400 text-gray-900 dark:text-gray-100',
        )}
      />
      <div className="flex items-center justify-end gap-2 text-[11px]">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={clsx(
            'rounded-full px-2 py-1 font-medium transition-colors',
            isOwn
              ? 'text-white/80 hover:bg-white/10'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700',
            isSubmitting && 'cursor-not-allowed opacity-50',
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave?.(draft)}
          disabled={!canSave}
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition-colors',
            isOwn
              ? 'bg-white text-brand-700 hover:bg-white/90 disabled:opacity-50'
              : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500',
            !canSave && 'cursor-not-allowed',
          )}
        >
          {isSubmitting ? <Spinner size="sm" /> : null}
          <span>Save</span>
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Bubble proper                                                       *
 * ------------------------------------------------------------------ */
const MessageBubble = ({
  message,
  isOwn = false,
  isGroup = false,
  isAdmin = false,
  showAvatar = true,
  showName = true,
  tickStatus = 'sent',
  tickTooltip = '',
  currentUserId = null,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetry,
}) => {
  const isSystem = message?.type === 'system';
  const isDeleted = message?.deletedFor === 'everyone';
  const isImage = message?.type === 'image' && Boolean(message?.imageUrl);
  const isPending = Boolean(message?._pending);
  const isFailed = Boolean(message?._failed);
  const senderName =
    message?.sender?.displayName || message?.sender?.username || 'Unknown';
  const time = formatClockTime(message?.createdAt);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingScope, setDeletingScope] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isReacting, setIsReacting] = useState(false);

  /* ---------- Long-press (mobile) ---------- */
  const longPressTimerRef = useRef(null);
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  /* Cancel an in-flight long-press timer if the bubble unmounts mid-press
   * (route change, conversation switch, etc.). Otherwise the timeout
   * could fire against a stale closure and try to open the menu on an
   * unmounted component. */
  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  const handleTouchStart = useCallback(() => {
    if (isSystem || isDeleted || isEditing) return;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, isDeleted, isEditing, isSystem]);

  const handleTouchCancel = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  /* ---------- Eligibility ---------- */
  const createdAtMs = useMemo(() => {
    const t = message?.createdAt ? new Date(message.createdAt).getTime() : NaN;
    return Number.isNaN(t) ? null : t;
  }, [message?.createdAt]);

  const withinEditWindow = useMemo(() => {
    if (createdAtMs == null) return false;
    return Date.now() - createdAtMs <= EDIT_WINDOW_MS;
  }, [createdAtMs]);

  const withinDeleteWindow = useMemo(() => {
    if (createdAtMs == null) return false;
    return Date.now() - createdAtMs <= DELETE_WINDOW_MS;
  }, [createdAtMs]);

  /* `canEdit` mirrors the server check: own + text type + within window
   * + persisted (no `_pending` / `_failed`) + not already deleted. The
   * server is the authority; the UI just hides ineligible options. */
  const canEdit =
    isOwn &&
    !isDeleted &&
    !isPending &&
    !isFailed &&
    !isSystem &&
    message?.type === 'text' &&
    withinEditWindow &&
    Boolean(message?._id);

  const canDeleteForEveryone = !isPending && !isFailed && (
    isAdmin || (isOwn && withinDeleteWindow)
  );

  const canDelete = !isSystem && !isDeleted && Boolean(message?._id);
  const canCopy = !isDeleted && !isSystem && typeof message?.text === 'string' && message.text.length > 0;
  const canReply = !isDeleted && !isSystem && !isPending && !isFailed && Boolean(message?._id);
  const canReact = !isDeleted && !isSystem && Boolean(message?._id);

  const showActionButton = !isSystem && !isDeleted && !isEditing;

  /* ---------- Action wiring ---------- */
  const handleCopy = useCallback(async () => {
    if (!message?.text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.text);
        toast.success('Message copied');
      } else {
        // Fallback for legacy browsers (and for non-secure contexts where
        // the Clipboard API is gated). A hidden textarea + execCommand
        // is intentionally minimal — we only enter this branch in the
        // wild on http://localhost or pre-2019 browsers.
        const helper = document.createElement('textarea');
        helper.value = message.text;
        helper.setAttribute('readonly', '');
        helper.style.position = 'absolute';
        helper.style.left = '-9999px';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        document.body.removeChild(helper);
        toast.success('Message copied');
      }
    } catch {
      toast.error('Could not copy message');
    }
  }, [message?.text]);

  const handleReplyClick = useCallback(() => {
    onReply?.(message);
  }, [message, onReply]);

  const handleEditClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleEditSave = useCallback(
    async (nextText) => {
      const trimmed = (nextText || '').trim();
      if (!trimmed || trimmed === (message?.text || '').trim()) {
        setIsEditing(false);
        return;
      }
      if (!onEdit) {
        setIsEditing(false);
        return;
      }
      setIsSubmittingEdit(true);
      try {
        await onEdit(message, trimmed);
        setIsEditing(false);
      } catch {
        // Toast emitted by parent — keep the editor open so the user
        // can retry without retyping.
      } finally {
        setIsSubmittingEdit(false);
      }
    },
    [message, onEdit],
  );

  const handleDeleteClick = useCallback(() => {
    setConfirmDeleteOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(
    async (scope) => {
      if (!onDelete) {
        setConfirmDeleteOpen(false);
        return;
      }
      setDeletingScope(scope);
      try {
        await onDelete(message, scope);
        setConfirmDeleteOpen(false);
      } catch {
        // Parent toasts; leave the modal open so the user can retry.
      } finally {
        setDeletingScope(null);
      }
    },
    [message, onDelete],
  );

  const handleReactionToggle = useCallback(
    async (emoji) => {
      if (!onReact || !message?._id || isReacting) return;
      setIsReacting(true);
      try {
        await onReact(message, emoji);
      } finally {
        setIsReacting(false);
      }
    },
    [isReacting, message, onReact],
  );

  const handleRetry = useCallback(async () => {
    if (!onRetry || !isFailed || isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry(message);
    } finally {
      setIsRetrying(false);
    }
  }, [isFailed, isRetrying, message, onRetry]);

  /* ---------- Body ---------- */
  const bodyContent = useMemo(() => {
    if (isDeleted) return <DeletedBubble isOwn={isOwn} />;

    if (isImage) {
      return (
        <span
          className={clsx(
            'block overflow-hidden rounded-2xl',
            isOwn ? 'rounded-br-sm' : 'rounded-bl-sm',
          )}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Open image"
            className="block w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <img
              src={message.imageUrl}
              alt={message.text || 'Shared image'}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="max-h-80 w-auto max-w-full object-cover"
            />
          </button>
          {message.text ? (
            <span
              className={clsx(
                'block px-3 py-2 text-sm whitespace-pre-wrap wrap-break-word',
                isOwn
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
              )}
            >
              {renderLinkified(message.text)}
            </span>
          ) : null}
        </span>
      );
    }

    return (
      <span
        className={clsx(
          'inline-block max-w-full whitespace-pre-wrap wrap-break-word rounded-2xl px-3 py-2 text-sm shadow-sm',
          isOwn
            ? 'rounded-br-sm bg-brand-600 text-white'
            : 'rounded-bl-sm bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
        )}
      >
        {renderLinkified(message.text || '')}
      </span>
    );
  }, [isDeleted, isImage, isOwn, message]);

  if (isSystem) {
    return <SystemBubble message={message} />;
  }

  /* ---------- Render ---------- */
  const showReplyQuote =
    !isDeleted && message?.replyTo && typeof message.replyTo === 'object';

  return (
    <div
      className={clsx(
        'group/bubble flex w-full items-end gap-2 px-2',
        isOwn ? 'justify-end' : 'justify-start',
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchCancel}
      onTouchMove={handleTouchCancel}
      onTouchCancel={handleTouchCancel}
    >
      {!isOwn ? (
        <span className={clsx('w-8 shrink-0', !showAvatar && 'invisible')}>
          {showAvatar ? (
            <Avatar src={message?.sender?.avatarUrl} name={senderName} size="sm" />
          ) : null}
        </span>
      ) : null}

      <div
        className={clsx(
          'relative flex max-w-[75%] flex-col gap-0.5',
          isOwn ? 'items-end' : 'items-start',
        )}
      >
        {!isOwn && isGroup && showName ? (
          <span className="px-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
            {senderName}
          </span>
        ) : null}

        {/* Bubble + inline action button row. Position the trigger as a */}
        {/* sibling so the menu popover can anchor below the bubble.    */}
        <div className={clsx('relative flex items-start gap-1', isOwn && 'flex-row-reverse')}>
          <div className="flex max-w-full flex-col">
            {showReplyQuote ? (
              <ReplyQuote replyTo={message.replyTo} isOwn={isOwn} />
            ) : null}

            {isEditing ? (
              <InlineEditor
                initialText={message.text || ''}
                isOwn={isOwn}
                isSubmitting={isSubmittingEdit}
                onSave={handleEditSave}
                onCancel={handleEditCancel}
              />
            ) : (
              bodyContent
            )}
          </div>

          {showActionButton ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="Message actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={clsx(
                  'mt-1 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-opacity',
                  'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200',
                  // Only reveal on hover/focus on desktop; long-press
                  // on mobile opens the menu without the button.
                  menuOpen
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/bubble:opacity-100 focus:opacity-100',
                )}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>

              <BubbleMenu
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                isOwn={isOwn}
                canReply={canReply}
                canCopy={canCopy}
                canEdit={canEdit}
                canDelete={canDelete}
                onReply={handleReplyClick}
                onCopy={handleCopy}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onPickEmoji={canReact ? handleReactionToggle : undefined}
              />
            </div>
          ) : null}
        </div>

        {/* Reactions row */}
        {!isDeleted ? (
          <ReactionChips
            reactions={message?.reactions}
            currentUserId={currentUserId}
            onToggle={canReact ? handleReactionToggle : undefined}
            disabled={isReacting || !canReact}
          />
        ) : null}

        {/* Footer row: time + edited + ticks (or retry on failure) */}
        <span
          className={clsx(
            'flex items-center gap-1 px-1 text-[10px] tabular-nums',
            isOwn
              ? 'flex-row-reverse text-gray-400 dark:text-gray-500'
              : 'text-gray-400 dark:text-gray-500',
          )}
        >
          {time ? <span>{time}</span> : null}
          {message?.editedAt && !isDeleted ? (
            <span className="italic">edited</span>
          ) : null}
          {isOwn && !isDeleted && !isFailed ? (
            <MessageStatusTicks
              status={tickStatus}
              tooltip={isGroup ? tickTooltip : ''}
            />
          ) : null}
          {isOwn && isFailed ? (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              aria-label="Retry sending message"
              title="Retry"
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {isRetrying ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
              )}
              <span className="font-medium">Retry</span>
            </button>
          ) : null}
        </span>
      </div>

      {/* Click-to-zoom lightbox, mounted lazily so closed bubbles don't */}
      {/* contribute a portal node to the DOM tree.                      */}
      {isImage ? (
        <ImageLightbox
          open={lightboxOpen}
          src={message.imageUrl}
          alt={message.text || 'Shared image'}
          downloadHref={message.imageUrl}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}

      {/* Delete confirmation modal */}
      <Modal
        open={confirmDeleteOpen}
        onClose={() => (deletingScope ? null : setConfirmDeleteOpen(false))}
        title="Delete message?"
        description={
          canDeleteForEveryone
            ? 'You can remove this message just for you, or for everyone in the conversation.'
            : 'This will hide the message from your view only. Other people will still see it.'
        }
        size="sm"
        closeOnBackdrop={!deletingScope}
        closeOnEscape={!deletingScope}
      >
        <div className="flex flex-col gap-2 px-5 py-4">
          <button
            type="button"
            onClick={() => handleConfirmDelete('self')}
            disabled={Boolean(deletingScope)}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            {deletingScope === 'self' ? <Spinner size="sm" /> : null}
            <span>Delete for me</span>
          </button>

          {canDeleteForEveryone ? (
            <button
              type="button"
              onClick={() => handleConfirmDelete('everyone')}
              disabled={Boolean(deletingScope)}
              className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingScope === 'everyone' ? <Spinner size="sm" /> : null}
              <span>Delete for everyone</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            disabled={Boolean(deletingScope)}
            className="mt-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default memo(MessageBubble);
