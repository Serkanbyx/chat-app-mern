/**
 * Locale-aware absolute date/time formatters used across the chat
 * surface. Kept distinct from `formatRelativeTime.js`, which produces
 * the *short* relative labels for the conversation list ("now", "5m",
 * "Mon"). The helpers in this file render *absolute* values:
 *
 *   - `formatClockTime`     — "HH:MM" inside a message bubble.
 *   - `formatDaySeparator`  — "Today" / "Yesterday" / "12 Apr 2026"
 *                             between two messages on different days.
 *   - `formatLastSeen`      — "just now" / "5 min ago" / "12 Apr"
 *                             for the offline-presence subtitle.
 *   - `isSameCalendarDay`   — pure predicate used by the timeline to
 *                             decide whether to insert a day separator.
 *
 * Performance: every `Intl.DateTimeFormat` is allocated once at module
 * scope. Constructing a formatter is the expensive part — calling
 * `.format(date)` on an existing one is cheap. With a 500-message
 * timeline this avoids ~1000 unnecessary allocations per render.
 *
 * Privacy: `formatLastSeen` deliberately rounds to coarse buckets and
 * never exposes a precise timestamp. Surfacing the exact second a user
 * went offline would broadcast their activity pattern to anyone they
 * have ever spoken with.
 *
 * Robustness: every helper returns an empty string for falsy /
 * unparseable input so the caller can render the result inline without
 * a defensive guard.
 */

const DAY_SEPARATOR_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * `isSameCalendarDay(a, b)` — true iff two dates fall on the same Y/M/D
 * in the user's LOCAL timezone. Day separators must respect the viewer's
 * locale, so we never compare on UTC components.
 */
export const isSameCalendarDay = (a, b) => {
  if (!a || !b) return false;
  const dateA = a instanceof Date ? a : new Date(a);
  const dateB = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(dateA.getTime()) || Number.isNaN(dateB.getTime())) return false;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
};

/**
 * `formatDaySeparator(input)` — "Today" / "Yesterday" / "12 Apr 2026".
 *
 * Used between consecutive messages whose calendar day differs. The
 * "Today" / "Yesterday" labels are English literals matching the rest
 * of the UI copy; a future i18n pass would localize them.
 */
export const formatDaySeparator = (input, now = Date.now()) => {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameCalendarDay(date, today)) return 'Today';
  if (isSameCalendarDay(date, yesterday)) return 'Yesterday';
  return DAY_SEPARATOR_FORMATTER.format(date);
};

/**
 * `formatClockTime(input)` — locale-aware "HH:MM" used inside message
 * bubbles. Returns an empty string for falsy/invalid input so callers
 * can render the result inline without guards.
 */
export const formatClockTime = (input) => {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return TIME_FORMATTER.format(date);
};

/**
 * `formatLastSeen(input)` — "just now", "5 min ago", "2 h ago", "12 Apr".
 *
 * Drives the chat header subtitle when the other participant is offline
 * AND has `showOnlineStatus` enabled. Strings are kept short (header
 * line is narrow on mobile) and the exact timestamp is never exposed.
 */
export const formatLastSeen = (input, now = Date.now()) => {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  const time = date.getTime();
  if (Number.isNaN(time)) return '';

  const diffMs = now - time;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} h ago`;
  if (diffDay < 7) return `${diffDay} d ago`;
  return DAY_SEPARATOR_FORMATTER.format(date);
};
