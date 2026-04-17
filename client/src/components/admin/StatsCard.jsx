import clsx from 'clsx';

/**
 * StatsCard — small metric tile used by `AdminDashboard`.
 *
 * Why a dedicated component (instead of a generic card):
 *   - The dashboard renders a homogeneous grid of 8 metrics. Locking the
 *     visual treatment in one place keeps the grid optically aligned and
 *     makes every metric automatically inherit accent + dark-mode tweaks
 *     from a single edit.
 *
 * Variants are intentionally semantic ("danger" for suspended /
 * pending-reports counters, "neutral" for plain counts) instead of
 * raw colour names, so callers can't drift the palette per-callsite.
 *
 * `loading` paints a dim shimmer-free placeholder — we deliberately
 * avoid animated skeletons here because eight cards pulsing in sync
 * is more distracting than a static placeholder during the ~150 ms
 * the `/admin/stats` call typically takes.
 */

const VARIANT_STYLES = {
  neutral: {
    iconWrap:
      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  },
  brand: {
    iconWrap:
      'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
  },
  success: {
    iconWrap:
      'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  warning: {
    iconWrap:
      'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  },
  danger: {
    iconWrap:
      'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300',
  },
};

const formatNumber = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '–';
  return new Intl.NumberFormat().format(Number(value));
};

const StatsCard = ({
  label,
  value,
  helpText,
  icon: Icon,
  variant = 'neutral',
  loading = false,
}) => {
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.neutral;

  return (
    <article
      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"
      aria-busy={loading || undefined}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            styles.iconWrap,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <p
          className={clsx(
            'mt-1 text-2xl font-semibold leading-none tabular-nums text-gray-900 dark:text-white',
            loading && 'opacity-40',
          )}
        >
          {loading ? '…' : formatNumber(value)}
        </p>
        {helpText ? (
          <p className="mt-1 truncate text-[11px] text-gray-400 dark:text-gray-500">
            {helpText}
          </p>
        ) : null}
      </div>
    </article>
  );
};

export default StatsCard;
