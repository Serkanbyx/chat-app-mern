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
import EmojiPicker, { EmojiStyle, Theme as EmojiTheme } from 'emoji-picker-react';
import { ImagePlus, Send, Smile, X } from 'lucide-react';

import Spinner from '../common/Spinner.jsx';
import Tooltip from '../common/Tooltip.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import * as messageService from '../../api/message.service.js';
import { uploadMessageImage } from '../../api/upload.service.js';

/**
 * MessageComposer — bottom row of the chat surface.
 *
 * Owns four user-facing concerns the parent shouldn't touch:
 *   1. Composing the next message (text + optional image attachment +
 *      emoji insertion at the caret).
 *   2. Reply-to context: when the parent passes `replyTo`, we surface
 *      the quoted preview above the textarea and wire the cancel
 *      affordance.
 *   3. Live typing indicator: debounced `typing:start` / `typing:stop`
 *      socket emits keyed off the latest keystroke.
 *   4. Optimistic send pipeline: pushes a `_pending` bubble via the
 *      parent setter the instant the user hits "Send", then reconciles
 *      it with the server's persisted document (or marks `_failed` on
 *      timeout / ack failure / disconnected fallback failure).
 *
 * Why the parent owns the messages array (not this component):
 *   `MessagesList` (sibling of the composer) needs to render optimistic
 *   bubbles immediately. Having the composer mutate a shared parent
 *   setter keeps a single source of truth for the timeline and avoids
 *   re-implementing the dedupe / reconcile dance against socket echoes
 *   that already lives in `ChatPage`.
 *
 * SECURITY:
 *   - File picker accepts only `image/jpeg`, `image/png`, `image/webp`.
 *     This is a UX hint — the server's `upload.middleware.js` enforces
 *     the same MIME allow-list and a `MAX_UPLOAD_SIZE_MB` cap. Files
 *     larger than the client-side guess are rejected by the server too.
 *   - Image is uploaded FIRST to `/upload/message-image`, which returns
 *     a sanitised Cloudinary URL. We then send that URL through
 *     `message:send`. The client never picks an arbitrary URL.
 *   - Caption text is included in the `text` field; the server escapes
 *     control / HTML chars and the renderer (`MessageBubble`) emits
 *     plain JSX (auto-escaped) — no XSS path through the composer.
 *   - Reply-to is sent as a bare `messageId`; the server validates it
 *     belongs to the same conversation before persisting.
 *   - Pasted rich text is converted to plain text (browsers usually do
 *     this for `<textarea>` automatically, but we strip on `paste`
 *     anyway to defend against copy-paste of non-text MIME types).
 */

const MAX_TEXT_LENGTH = 4000; // mirrors server `MESSAGE_TEXT_MAX_LENGTH`
const MAX_IMAGE_MB = 5; // mirrors server `MAX_UPLOAD_SIZE_MB` default
const MAX_TEXTAREA_ROWS = 6;
const TYPING_IDLE_MS = 3000;
const SEND_ACK_TIMEOUT_MS = 8000;
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_MIMES.join(',');

const generateTempId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const trimEnd = (value) => (typeof value === 'string' ? value.replace(/\s+$/, '') : '');

const isImageFile = (file) =>
  file && typeof file === 'object' && ALLOWED_IMAGE_MIMES.includes(file.type);

/**
 * Truncate a multi-line preview down to one line for the reply / image
 * caption strip. Keeps the strip from doubling its height when the
 * quoted message is long-form.
 */
const onelinePreview = (text, max = 140) => {
  if (typeof text !== 'string' || text.length === 0) return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
};

const MessageComposer = ({
  conversationId,
  replyTo = null,
  onCancelReply,
  onOptimisticAdd,
  onOptimisticUpdate,
  onAfterSend,
  disabled = false,
  disabledReason = '',
}) => {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const { isConnected, emit, socket } = useSocket();

  const enterToSend = preferences?.enterToSend !== false;
  const emojiTheme =
    preferences?.theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT;

  /* ---------- Form state ---------- */
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiContainerRef = useRef(null);

  /* ---------- Typing indicator bookkeeping ----------
   * `typingActiveRef` lets us avoid re-emitting `typing:start` on every
   * keystroke once the server already knows we're typing. The debounce
   * timer fires `typing:stop` after `TYPING_IDLE_MS` of inactivity. */
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef(null);

  const clearTypingTimer = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearTypingTimer();
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    if (conversationId) {
      emit('typing:stop', { conversationId });
    }
  }, [clearTypingTimer, conversationId, emit]);

  const pingTyping = useCallback(() => {
    if (!conversationId || disabled) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      emit('typing:start', { conversationId });
    }
    clearTypingTimer();
    typingTimerRef.current = setTimeout(() => {
      stopTyping();
    }, TYPING_IDLE_MS);
  }, [clearTypingTimer, conversationId, disabled, emit, stopTyping]);

  /* Reset every shred of composer state when the conversation switches.
   * Otherwise a half-typed draft / preview could leak across chats. */
  useEffect(() => {
    setText('');
    setAttachment(null);
    setAttachmentPreview('');
    setIsEmojiOpen(false);
    setIsSending(false);
    setIsUploading(false);
    stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  /* Stop typing on unmount + on lost connection. The server-side
   * presence cleanup also clears stale typing on disconnect, but the
   * client emit keeps the UX snappy on transient blurs. */
  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    if (!socket) {
      typingActiveRef.current = false;
      clearTypingTimer();
    }
  }, [socket, clearTypingTimer]);

  /* ---------- Attachment object-URL lifecycle ----------
   * `URL.createObjectURL` allocates browser memory until revoked. We
   * revoke on attachment swap AND on unmount to avoid the slow leak
   * Chromium otherwise traps until the tab closes. */
  useEffect(() => {
    if (!attachment) {
      setAttachmentPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(attachment);
    setAttachmentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  /* ---------- Auto-resize textarea ----------
   * Compute the natural row height once, then cap the rendered height
   * at `MAX_TEXTAREA_ROWS` so very long drafts scroll instead of pushing
   * the message list off-screen. `useLayoutEffect` so the resize lands
   * before the next paint, no flicker. */
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_TEXTAREA_ROWS;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [text, attachmentPreview, replyTo]);

  /* ---------- Emoji picker dismissal ---------- */
  useOnClickOutside(
    emojiContainerRef,
    useCallback(() => {
      setIsEmojiOpen(false);
    }, []),
  );

  /* ---------- Composer guards ----------
   * `canSend` gates the submit button + Enter handling.
   *   - Need a conversation id (route guard fallback).
   *   - Either non-empty text OR an attachment.
   *   - Not currently in flight (uploading or awaiting ack).
   *   - Not disabled (e.g. blocked or read-only).
   * The text length cap matches the server validator so we never bother
   * the network with a payload Mongoose will reject. */
  const trimmedText = useMemo(() => trimEnd(text), [text]);
  const hasText = trimmedText.length > 0;
  const hasAttachment = Boolean(attachment);
  const isOverLimit = trimmedText.length > MAX_TEXT_LENGTH;
  const canSend =
    !disabled &&
    !isSending &&
    !isUploading &&
    Boolean(conversationId) &&
    (hasText || hasAttachment) &&
    !isOverLimit;

  /* ---------- Emoji insertion (caret-aware) ---------- */
  const handleEmojiSelect = useCallback(
    (emojiData) => {
      const insert = emojiData?.emoji ?? '';
      if (!insert) return;
      const el = textareaRef.current;
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}${insert}${text.slice(end)}`;
      if (next.length > MAX_TEXT_LENGTH) {
        toast.error(`Message too long (max ${MAX_TEXT_LENGTH} characters).`);
        return;
      }
      setText(next);
      // Restore caret + focus on the next frame, after React applies
      // the controlled value. Otherwise the caret jumps to end.
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        const caret = start + insert.length;
        el.setSelectionRange(caret, caret);
      });
      pingTyping();
    },
    [pingTyping, text],
  );

  /* ---------- File picker ---------- */
  const handleAttachClick = useCallback(() => {
    if (disabled || isSending || isUploading) return;
    fileInputRef.current?.click();
  }, [disabled, isSending, isUploading]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isImageFile(file)) {
      toast.error('Only JPG, PNG or WEBP images are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`Image too large. Max ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setAttachment(file);
    setIsEmojiOpen(false);
    // Move focus into the textarea so the user can immediately add a
    // caption without an extra click.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const clearAttachment = useCallback(() => {
    setAttachment(null);
  }, []);

  /* ---------- Optimistic message factory ---------- */
  const buildOptimisticMessage = useCallback(
    ({ clientTempId, type, body, imageUrl }) => {
      const senderProjection = user
        ? {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl ?? '',
          }
        : null;
      return {
        _id: undefined,
        clientTempId,
        conversationId,
        type,
        text: body,
        imageUrl: imageUrl ?? '',
        sender: senderProjection,
        createdAt: new Date().toISOString(),
        replyTo: replyTo ?? null,
        reactions: [],
        readBy: [],
        editedAt: null,
        deletedFor: 'none',
        _pending: true,
        _failed: false,
      };
    },
    [conversationId, replyTo, user],
  );

  /* ---------- Server send with timeout ----------
   * Prefer the WebSocket path (lower latency, server attaches
   * `clientTempId` to the broadcast for cross-tab dedupe). Fall back to
   * REST when the socket is down so a brief reconnect window doesn't
   * eat the user's message. */
  const sendOverSocket = useCallback(
    (payload) =>
      new Promise((resolve, reject) => {
        if (!socket || !isConnected) {
          reject(new Error('disconnected'));
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('timeout'));
        }, SEND_ACK_TIMEOUT_MS);

        socket.emit('message:send', payload, (ack) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ack && ack.success && ack.message) {
            resolve(ack.message);
          } else {
            reject(new Error(ack?.message || 'Send failed'));
          }
        });
      }),
    [isConnected, socket],
  );

  const sendOverRest = useCallback(
    async (payload) => {
      const result = await messageService.sendMessage(conversationId, payload);
      const wire = result?.data ?? result;
      if (!wire) throw new Error('Empty response from server');
      return wire;
    },
    [conversationId],
  );

  /* ---------- Submit ----------
   * 1. Build clientTempId and the optimistic bubble.
   * 2. If there is an attachment, upload it FIRST (server returns a
   *    vetted Cloudinary URL).
   * 3. Hand the payload to the socket (or REST fallback).
   * 4. Reconcile against the parent's messages cache, regardless of
   *    success or failure so the timeline never has an orphaned spinner.
   */
  const handleSubmit = useCallback(async () => {
    if (!canSend) return;

    const clientTempId = generateTempId();
    const trimmed = trimmedText;
    const replyToId = replyTo?._id ? String(replyTo._id) : null;

    setIsSending(true);
    setIsEmojiOpen(false);
    stopTyping();

    let optimistic = null;
    let imageUrl = '';
    let imagePublicId = '';

    try {
      if (hasAttachment) {
        // Upload BEFORE pushing the optimistic bubble — the upload step
        // can take a long time on slow networks and we don't want a
        // ghost bubble lingering with no body if it ultimately fails.
        setIsUploading(true);
        try {
          const uploaded = await uploadMessageImage(attachment);
          const data = uploaded?.data ?? uploaded;
          imageUrl = data?.url || '';
          imagePublicId = data?.publicId || '';
          if (!imageUrl) throw new Error('Upload did not return a URL');
        } finally {
          setIsUploading(false);
        }
      }

      const type = imageUrl ? 'image' : 'text';
      optimistic = buildOptimisticMessage({
        clientTempId,
        type,
        body: trimmed,
        imageUrl,
      });
      onOptimisticAdd?.(optimistic);

      // Reset the input area immediately for snappy UX. The bubble is
      // already in the timeline as `_pending`, so the user can keep
      // typing the next message without waiting for the ack.
      setText('');
      setAttachment(null);
      onCancelReply?.();
      onAfterSend?.();

      const payload = {
        conversationId,
        type,
        text: trimmed,
        imageUrl,
        imagePublicId,
        replyTo: replyToId,
        clientTempId,
      };

      let serverMessage = null;
      try {
        serverMessage = await sendOverSocket(payload);
      } catch (socketErr) {
        // Drop down to REST whenever we can't reach the socket at all
        // OR when the ack timed out. Surface real validation errors
        // (anything else) as a failed bubble so the user can retry.
        const reason = socketErr?.message || '';
        const isRecoverable = reason === 'disconnected' || reason === 'timeout';
        if (!isRecoverable) throw socketErr;
        serverMessage = await sendOverRest(payload);
      }

      onOptimisticUpdate?.(clientTempId, {
        ...serverMessage,
        clientTempId,
        _pending: false,
        _failed: false,
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to send message';
      toast.error(message);
      if (optimistic) {
        onOptimisticUpdate?.(clientTempId, {
          _pending: false,
          _failed: true,
        });
      }
    } finally {
      setIsSending(false);
      // Restore focus so the user can keep typing without re-clicking.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [
    attachment,
    buildOptimisticMessage,
    canSend,
    conversationId,
    hasAttachment,
    onAfterSend,
    onCancelReply,
    onOptimisticAdd,
    onOptimisticUpdate,
    replyTo,
    sendOverRest,
    sendOverSocket,
    stopTyping,
    trimmedText,
  ]);

  /* ---------- Keyboard handling ----------
   * Honour `enterToSend`. The inverted variant (Ctrl/Cmd+Enter to send)
   * is a common preference for power users who type long-form messages
   * with embedded newlines and don't want Enter to submit. */
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter') return;
      if (event.nativeEvent?.isComposing) return; // IME safety

      if (enterToSend) {
        if (event.shiftKey) return; // Shift+Enter → newline
        event.preventDefault();
        handleSubmit();
      } else if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [enterToSend, handleSubmit],
  );

  const handleTextChange = useCallback(
    (event) => {
      const value = event.target.value;
      // Soft cap on raw input. Without this an aggressive paste could
      // exceed the server limit and we'd still send it then fail.
      if (value.length > MAX_TEXT_LENGTH * 1.1) {
        toast.error(`Message too long (max ${MAX_TEXT_LENGTH} characters).`);
        return;
      }
      setText(value);
      pingTyping();
    },
    [pingTyping],
  );

  const handlePaste = useCallback(
    (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      // Promote a clipboard image into the attachment slot when the user
      // pastes a screenshot directly. Falls through to default text paste
      // if no image is present.
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file && isImageFile(file) && file.size <= MAX_IMAGE_MB * 1024 * 1024) {
            event.preventDefault();
            setAttachment(file);
            return;
          }
        }
      }
      // Browsers convert rich-text paste to plain text inside <textarea>
      // automatically; nothing extra to do for the text path.
    },
    [],
  );

  /* ---------- Render ---------- */
  if (disabled) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
        {disabledReason || 'You cannot send messages in this conversation.'}
      </div>
    );
  }

  const remaining = MAX_TEXT_LENGTH - trimmedText.length;
  const showCounter = trimmedText.length > MAX_TEXT_LENGTH * 0.8;

  /* When the live socket is down we still allow the click — the submit
   * pipeline gracefully drops down to the REST fallback. The button just
   * looks muted and the tooltip explains what's happening so the user
   * understands why their message might queue / fail. */
  const sendTooltipLabel = !isConnected
    ? 'Offline — will try to send over HTTP'
    : '';
  const sendVisuallyMuted = canSend && !isConnected;

  return (
    <div className="relative border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {/* Reply-to banner */}
      {replyTo ? (
        <div className="flex items-start gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/60">
          <span className="mt-0.5 inline-block h-full w-0.5 self-stretch rounded bg-brand-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">
              Replying to {replyTo?.sender?.displayName || replyTo?.sender?.username || 'message'}
            </p>
            <p className="truncate text-xs text-gray-600 dark:text-gray-400">
              {onelinePreview(replyTo?.text) ||
                (replyTo?.type === 'image' ? '📷 Photo' : 'Message')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Image preview banner */}
      {attachmentPreview ? (
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="relative">
            <img
              src={attachmentPreview}
              alt="Attachment preview"
              className="h-16 w-16 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
            />
            {isUploading ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                <Spinner size="sm" />
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">
              {attachment?.name || 'Image'}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Add an optional caption below, then send.
            </p>
          </div>
          <button
            type="button"
            onClick={clearAttachment}
            disabled={isUploading || isSending}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Remove attachment"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Emoji picker popover */}
      {isEmojiOpen ? (
        <div
          ref={emojiContainerRef}
          className="absolute bottom-full right-2 z-30 mb-2 overflow-hidden rounded-xl shadow-2xl"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiSelect}
            theme={emojiTheme}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis
            searchPlaceholder="Search emoji"
            previewConfig={{ showPreview: false }}
            width={320}
            height={380}
          />
        </div>
      ) : null}

      {/* Composer row */}
      <form
        className="flex items-end gap-2 px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        <button
          type="button"
          onClick={handleAttachClick}
          disabled={isSending || isUploading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-300"
          aria-label="Attach image"
          title="Attach image"
        >
          <ImagePlus className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="flex min-w-0 flex-1 items-end gap-1 rounded-2xl bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={stopTyping}
            placeholder={hasAttachment ? 'Add a caption…' : 'Message…'}
            rows={1}
            maxLength={Math.floor(MAX_TEXT_LENGTH * 1.1)}
            aria-label="Message text"
            className="scrollbar-thin max-h-40 min-h-6 w-full resize-none border-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder-gray-500"
          />

          <button
            type="button"
            onClick={() => setIsEmojiOpen((prev) => !prev)}
            disabled={isSending}
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
              isEmojiOpen
                ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300'
                : 'text-gray-500 hover:bg-gray-200 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-brand-300',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            aria-label="Insert emoji"
            aria-expanded={isEmojiOpen}
            title="Insert emoji"
          >
            <Smile className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <Tooltip label={sendTooltipLabel} position="top">
          <button
            type="submit"
            disabled={!canSend}
            aria-disabled={!canSend || sendVisuallyMuted}
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all',
              !canSend
                ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                : sendVisuallyMuted
                ? 'bg-amber-500/80 text-white shadow-sm hover:bg-amber-500 active:scale-95 dark:bg-amber-600/80 dark:hover:bg-amber-600'
                : 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:scale-95 dark:bg-brand-500 dark:hover:bg-brand-400',
            )}
            aria-label={
              sendVisuallyMuted ? 'Send message (offline)' : 'Send message'
            }
            title={sendVisuallyMuted ? 'Offline — will try to send over HTTP' : 'Send message'}
          >
            {isSending || isUploading ? (
              <Spinner size="sm" className="border-white/40 border-t-white" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </Tooltip>
      </form>

      {/* Footer hints — only render when relevant to keep the row tight. */}
      {(showCounter || isOverLimit || !isConnected) ? (
        <div className="flex items-center justify-between gap-2 px-4 pb-1.5 text-[10px]">
          <span
            className={clsx(
              'truncate',
              isConnected ? 'text-gray-400 dark:text-gray-500' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            {isConnected ? '' : 'Offline — message will be sent over HTTP.'}
          </span>
          {showCounter || isOverLimit ? (
            <span
              className={clsx(
                'tabular-nums',
                isOverLimit
                  ? 'font-medium text-red-600 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500',
              )}
            >
              {remaining}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default memo(MessageComposer);
