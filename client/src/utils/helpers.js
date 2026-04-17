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
 * Date helpers live in `./formatDate.js` — single source of truth.
 * Re-exported here for backward compatibility with existing imports.
 * Prefer importing directly from `./formatDate.js` in new code.
 * ------------------------------------------------------------------ */
export {
  isSameCalendarDay,
  formatDaySeparator,
  formatClockTime,
  formatLastSeen,
} from './formatDate.js';

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
