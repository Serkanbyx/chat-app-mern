/**
 * `formatRelativeTime(input)` — short, sidebar-friendly relative
 * timestamp ("now", "5m", "3h", "Mon", "Mar 5", "Mar 5 2024").
 *
 * Why a custom helper instead of `Intl.RelativeTimeFormat`:
 *   - We need *abbreviated* labels ("3h"), not "3 hours ago".
 *   - The chat list trades any future-time semantics for compactness;
 *     a couple of `Intl` formatters in a tight loop is also measurably
 *     more expensive than the math below when many rows render.
 *
 * Rules used by the conversation list (closely matching common chat
 * apps):
 *   < 60s          → "now"
 *   < 60m          → "Nm"
 *   < 24h          → "Nh"
 *   same calendar week (≤ 6 days back) → weekday short label ("Mon")
 *   same calendar year                 → "Mon Day" via `Intl`
 *   otherwise                          → "Mon Day Year" via `Intl`
 *
 * Returns an empty string for falsy / unparseable input so callers can
 * render the result inline without guards.
 */

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export function formatRelativeTime(input, now = Date.now()) {
  if (!input) return '';

  const date = input instanceof Date ? input : new Date(input);
  const time = date.getTime();
  if (Number.isNaN(time)) return '';

  const diff = now - time;

  if (diff < ONE_MINUTE_MS) return 'now';
  if (diff < ONE_HOUR_MS) return `${Math.floor(diff / ONE_MINUTE_MS)}m`;
  if (diff < ONE_DAY_MS) return `${Math.floor(diff / ONE_HOUR_MS)}h`;

  if (diff < 7 * ONE_DAY_MS) return WEEKDAY_FORMATTER.format(date);

  const reference = new Date(now);
  if (date.getFullYear() === reference.getFullYear()) {
    return SHORT_DATE_FORMATTER.format(date);
  }
  return FULL_DATE_FORMATTER.format(date);
}

export default formatRelativeTime;
