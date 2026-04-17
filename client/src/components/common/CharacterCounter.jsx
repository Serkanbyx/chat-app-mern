import { useId } from 'react';
import clsx from 'clsx';

/**
 * CharacterCounter — `current/max` indicator for capped inputs (Bio,
 * Group name, Report details, Review note, …).
 *
 * Why a dedicated component:
 *   - Every textarea / input with a server-enforced length limit was
 *     re-implementing the same `current/max` span with bespoke colour
 *     thresholds. Centralising the logic keeps the visual language
 *     consistent and makes a future copy/styling change a one-file edit.
 *
 * Behaviour:
 *   - Renders nothing if `max` is missing or non-positive — defensive
 *     so callers can pipe a constant straight from `utils/constants.js`
 *     without guarding.
 *   - Threshold tone:
 *       · 0 to 80%  → muted gray
 *       · 80% to <100% → amber (warning)
 *       · ≥ 100%   → red (over-cap; the text is also clamped via
 *                    `slice(0, max)` at the call site, but we still
 *                    surface the state in case a future caller forgets).
 *
 * Accessibility:
 *   - Wired via `aria-describedby`: pass the returned `id` (or our
 *     generated one if `id` is omitted) to the input's
 *     `aria-describedby` so screen readers announce the remaining
 *     budget. We also include a hidden `<span>` with a verbose
 *     "X of Y characters" string so the announcement is meaningful
 *     in isolation.
 *   - `aria-live="polite"` so the count is re-announced as the user
 *     types, but never interrupts the user mid-word.
 */
const CharacterCounter = ({
  current = 0,
  max,
  id,
  className,
  showRemaining = false,
}) => {
  const generatedId = useId();
  const counterId = id ?? `char-counter-${generatedId}`;

  if (!max || max <= 0) return null;

  const safeCurrent = Math.max(0, Number(current) || 0);
  const ratio = safeCurrent / max;
  const isOverCap = safeCurrent >= max;
  const isNearCap = !isOverCap && ratio >= 0.8;

  const display = showRemaining
    ? `${Math.max(0, max - safeCurrent)} left`
    : `${safeCurrent}/${max}`;

  const announcement = `${safeCurrent} of ${max} characters`;

  return (
    <span
      id={counterId}
      aria-live="polite"
      className={clsx(
        'block text-right text-[11px] tabular-nums transition-colors',
        isOverCap
          ? 'font-medium text-red-600 dark:text-red-400'
          : isNearCap
            ? 'font-medium text-amber-600 dark:text-amber-400'
            : 'text-gray-400 dark:text-gray-500',
        className,
      )}
    >
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{announcement}</span>
    </span>
  );
};

export default CharacterCounter;
