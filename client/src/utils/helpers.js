/**
 * Generic, render-time helpers shared by the chat surface.
 *
 * SECURITY note: every helper here is built with the assumption that
 * caller-supplied input is UNTRUSTED. The server already strips control
 * characters and HTML structural chars, but we still defence-in-depth
 * here because:
 *   - Optimistic-UI may render text BEFORE the server echo (race window).
 *   - A future migration could surface raw payloads we don't control.
 */

/**
 * `linkifyText(text)` — split a string into an array of inline tokens
 * the renderer can map to React nodes. Each token is either:
 *   { type: 'text', value: string }
 *   { type: 'link', href: string, label: string }
 *
 * Why an explicit token array instead of `dangerouslySetInnerHTML`:
 *   We never inject HTML the user controls. The consumer renders text
 *   tokens via React JSX (auto-escaped) and link tokens via `<a>` with
 *   a vetted `href`. There is no possible XSS path, even if the message
 *   contains `<script>` or `javascript:` substrings.
 *
 * Scheme allow-list:
 *   Only `http://` and `https://` URLs become links. `javascript:`,
 *   `data:`, `file:`, custom protocols and bare `mailto:` are rendered
 *   as plain text. We intentionally do NOT auto-link `www.example.com`
 *   without an explicit scheme — that would force us to fabricate a
 *   protocol and could mislead the user about where the link goes.
 */
const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`]+/gi;

const isSafeUrl = (raw) => {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const linkifyText = (text) => {
  if (typeof text !== 'string' || text.length === 0) return [];

  const tokens = [];
  let cursor = 0;
  URL_REGEX.lastIndex = 0;
  let match;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    // Trim trailing punctuation people commonly put after URLs in chat
    // ("see https://x.com." or "https://x.com,"). We split it back into
    // the next text token instead of including it in the link.
    let trimmed = raw;
    let trail = '';
    while (trimmed.length > 0 && /[.,;:!?)\]}'"]/.test(trimmed.slice(-1))) {
      trail = trimmed.slice(-1) + trail;
      trimmed = trimmed.slice(0, -1);
    }

    if (start > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, start) });
    }

    if (isSafeUrl(trimmed)) {
      tokens.push({ type: 'link', href: trimmed, label: trimmed });
    } else {
      // Untrusted scheme — render the original substring as plain text
      // so the user still sees what was sent without making it clickable.
      tokens.push({ type: 'text', value: trimmed });
    }

    if (trail) tokens.push({ type: 'text', value: trail });
    cursor = start + raw.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }

  return tokens;
};

/* ------------------------------------------------------------------
 * Date helpers used by the message timeline.
 *
 * `Intl.DateTimeFormat` is allocated once per format so a long history
 * doesn't repeatedly construct the same formatter — measurable in
 * 500+ message lists.
 * ------------------------------------------------------------------ */

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
 * "Today" / "Yesterday" labels need to be language-aware in a future
 * i18n pass; for now they are English literals matching the rest of
 * the UI copy.
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
 * AND has `showOnlineStatus` enabled. We deliberately keep the strings
 * short (header line is narrow on mobile) and never expose the exact
 * timestamp — that would broadcast the user's activity pattern.
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

/**
 * `groupConsecutiveBy(messages, gapMs)` — annotates each message with
 * `isGroupStart` / `isGroupEnd` flags so the renderer can suppress
 * the avatar + sender name on inner bubbles of a run from the same
 * sender within `gapMs`.
 *
 * A new group starts whenever:
 *   - sender id differs from the previous message,
 *   - the gap to the previous message exceeds `gapMs`, or
 *   - either message is a system message (system messages render
 *     full-width and must never be grouped with user bubbles).
 *
 * Returns a NEW array (does not mutate). Each entry is `{ message,
 * isGroupStart, isGroupEnd }`.
 */
export const groupConsecutiveBy = (messages, gapMs = 5 * 60 * 1000) => {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const result = messages.map((message) => ({
    message,
    isGroupStart: true,
    isGroupEnd: true,
  }));

  for (let i = 1; i < result.length; i += 1) {
    const prev = result[i - 1].message;
    const curr = result[i].message;
    if (!prev || !curr) continue;
    if (prev.type === 'system' || curr.type === 'system') continue;

    const sameSender =
      prev.sender?._id && curr.sender?._id &&
      String(prev.sender._id) === String(curr.sender._id);
    if (!sameSender) continue;

    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(curr.createdAt).getTime();
    if (Number.isNaN(prevTime) || Number.isNaN(currTime)) continue;
    if (currTime - prevTime > gapMs) continue;

    // Same sender + within window: collapse the boundary between the
    // two bubbles. The previous one is no longer a group END, and the
    // current one is no longer a group START.
    result[i - 1].isGroupEnd = false;
    result[i].isGroupStart = false;
  }

  return result;
};
