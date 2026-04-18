import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

/**
 * SearchInChatBar — slide-in panel that lets the viewer scan the
 * currently-loaded message timeline for a substring.
 *
 * Scope (intentional):
 *   - Only searches the messages already in memory (the same window
 *     `MessagesList` renders). We do NOT round-trip to the server here:
 *     full-text search across a conversation is a separate feature
 *     (paginated `searchMessages` endpoint) and would require its own
 *     UX for previews, jump-to-context loading older pages, etc.
 *     Limiting scope keeps the affordance honest — what the user sees
 *     in the bar is exactly what's on screen.
 *   - System / deleted bubbles are skipped because their displayed text
 *     ("Conversation updated" / "This message was deleted") would
 *     produce noisy false positives.
 *
 * Keyboard model:
 *   - Esc                 → close.
 *   - Enter               → jump to NEXT match (wraps).
 *   - Shift+Enter         → jump to PREVIOUS match (wraps).
 *   - The input gets autoFocus when the bar opens; we restore focus to
 *     it on every reopen so a closed-and-reopened search picks up where
 *     it left off without needing a click.
 *
 * Privacy / SECURITY:
 *   - The query never leaves the browser; nothing is logged or
 *     transmitted. This is local DOM-equivalent text scanning.
 *   - We compare against `message.text` only — image URLs and reply
 *     quotes are NOT searched, both to keep the results predictable
 *     and to avoid accidentally exposing a Cloudinary path the bubble
 *     itself never displayed.
 */

const norm = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

const SearchInChatBar = ({
  open,
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
  onClose,
}) => {
  const inputId = useId();
  const inputRef = useRef(null);

  /* Re-focus the input whenever the bar (re)opens. Otherwise the user
   * has to click into the field after every toggle, which makes the
   * keyboard shortcut feel half-broken. */
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) onPrev?.();
        else onNext?.();
      }
    },
    [onClose, onNext, onPrev],
  );

  const counterLabel = useMemo(() => {
    if (!query.trim()) return '';
    if (matchCount === 0) return 'No matches';
    return `${currentIndex + 1} / ${matchCount}`;
  }, [currentIndex, matchCount, query]);

  if (!open) return null;

  return (
    <div
      role="search"
      aria-label="Search in conversation"
      className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <label htmlFor={inputId} className="sr-only">
        Search messages
      </label>
      <div className="relative flex flex-1 items-center">
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-gray-400">
          <Search className="h-4 w-4" aria-hidden="true" />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages on screen…"
          className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-20 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:bg-gray-900"
        />
        <span
          aria-live="polite"
          className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] tabular-nums text-gray-500 dark:text-gray-400"
        >
          {counterLabel}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={matchCount === 0}
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={matchCount === 0}
          aria-label="Next match"
          title="Next match (Enter)"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          title="Close (Esc)"
          className="ml-1 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

/**
 * Build the ordered list of message ids that match `query` from the
 * given timeline. Exported so `ChatPage` can recompute matches without
 * depending on the bar's internals (the bar stays purely presentational).
 */
export const collectMatches = (messages, query) => {
  const needle = norm(query).trim();
  if (!needle || !Array.isArray(messages)) return [];
  const out = [];
  for (const message of messages) {
    if (!message || !message._id) continue;
    if (message.type === 'system') continue;
    if (message.deletedFor === 'everyone') continue;
    const haystack = norm(message.text);
    if (haystack && haystack.includes(needle)) {
      out.push(String(message._id));
    }
  }
  return out;
};

export default SearchInChatBar;
