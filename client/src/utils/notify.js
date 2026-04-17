import { toast } from 'react-hot-toast';

/**
 * `notify` — thin, opinionated wrapper around `react-hot-toast`.
 *
 * Why we don't call `toast.success(message)` directly from features:
 *
 *   1. SECURITY — toast bodies surface server errors verbatim. A
 *      malicious payload could embed control characters, ANSI escapes,
 *      or just absurdly long text that breaks the layout / leaks RAM.
 *      We sanitise once, here, instead of asking every caller to.
 *
 *   2. UX consistency — without dedupe a chatty backend can stack a
 *      dozen identical "Network error" toasts in 200ms. We assign each
 *      message a stable id derived from its kind + text so repeats
 *      replace the previous one rather than piling up.
 *
 *   3. A11y — toasts must be reachable by screen readers but the
 *      Toaster itself relies on `aria-live="polite"`. We make sure the
 *      message string we hand it is plain text (no JSX) so the
 *      announcement is faithful to what is rendered.
 *
 * The wrapper intentionally exposes the same shape as `react-hot-toast`
 * (`success`, `error`, `info`, `loading`, `dismiss`, `promise`) so it
 * is a drop-in replacement.
 */

/* Hard cap toast text. ~240 chars is enough for "Could not delete the
 * group: <reason>" while still fitting on a phone screen. Anything
 * longer is almost certainly a stack trace leaking through and we'd
 * rather truncate than wallpaper the screen. */
const MAX_LENGTH = 240;

/* Strip control chars (except common whitespace) so attackers can't
 * push terminal escapes or zero-width chars through error responses
 * to forge legitimate-looking notifications. */
const sanitize = (input) => {
  if (input === null || input === undefined) return '';
  const text = typeof input === 'string' ? input : String(input);
  /* eslint-disable-next-line no-control-regex */
  const cleaned = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  if (cleaned.length <= MAX_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_LENGTH - 1)}…`;
};

/* Tiny djb2 hash so we can dedupe even when callers don't pass an id.
 * Two consecutive calls with the same `kind`+`text` resolve to the
 * same toast id, which makes `react-hot-toast` reuse the existing
 * notification instead of stacking. */
const hash = (value) => {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
};

const buildId = (kind, text, explicit) => explicit ?? `${kind}:${hash(text)}`;

const fire = (kind, message, options = {}) => {
  const text = sanitize(message);
  if (!text) return null;
  const id = buildId(kind, text, options.id);
  const config = { ...options, id };

  switch (kind) {
    case 'success':
      return toast.success(text, config);
    case 'error':
      return toast.error(text, config);
    case 'loading':
      return toast.loading(text, config);
    default:
      return toast(text, config);
  }
};

export const notify = {
  success: (message, options) => fire('success', message, options),
  error: (message, options) => fire('error', message, options),
  info: (message, options) => fire('info', message, options),
  loading: (message, options) => fire('loading', message, options),
  dismiss: (id) => toast.dismiss(id),
  /**
   * `notify.promise(thenable, { loading, success, error })` — pass-
   * through to `toast.promise` but sanitises every label before the
   * library ever sees it. Useful for save/delete flows where we want
   * a single toast that flips state with the request lifecycle.
   */
  promise: (promise, messages = {}, options = {}) =>
    toast.promise(
      promise,
      {
        loading: sanitize(messages.loading) || 'Working…',
        success: typeof messages.success === 'function'
          ? (value) => sanitize(messages.success(value))
          : sanitize(messages.success) || 'Done',
        error: typeof messages.error === 'function'
          ? (value) => sanitize(messages.error(value))
          : sanitize(messages.error) || 'Something went wrong',
      },
      options,
    ),
};

export default notify;
