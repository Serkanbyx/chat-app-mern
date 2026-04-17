import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Flag,
  MessageSquare,
  MessagesSquare,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';

import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import StatsCard from '../../components/admin/StatsCard.jsx';
import ReportRow from '../../components/admin/ReportRow.jsx';
import {
  getStats,
  listReports,
} from '../../api/admin.service.js';

/**
 * AdminDashboard — moderator landing page at `/admin/dashboard`.
 *
 * Two parallel fetches drive the page:
 *   1. `/admin/stats` for the eight metric tiles.
 *   2. `/admin/reports?status=pending&limit=5` for the recent-reports
 *      panel.
 * They run in parallel (single `Promise.all`) so the page paints in
 * one round-trip — sequential calls would double the perceived
 * latency for a screen the moderator opens dozens of times a day.
 *
 * State shape: a single `state` object instead of a handful of
 * `useState` hooks, so a refresh swap is atomic and we can never
 * paint half-stale numbers next to a fresh report list.
 *
 * SECURITY:
 *   - The page is reachable only via `<AdminRoute>`; the server
 *     also gates every endpoint by `protect + adminOnly`. The UI
 *     trusts neither — if both calls 403 we render an empty error
 *     state rather than crash.
 */

const STAT_TILES = [
  {
    key: 'totalUsers',
    label: 'Total users',
    icon: Users,
    variant: 'brand',
    helpText: 'Excludes deleted accounts',
  },
  {
    key: 'activeUsers',
    label: 'Active (24h)',
    icon: UserCheck,
    variant: 'success',
    helpText: 'Seen in the last 24 hours',
  },
  {
    key: 'suspendedUsers',
    label: 'Suspended',
    icon: UserX,
    variant: 'danger',
    helpText: 'Currently disabled accounts',
  },
  {
    key: 'totalConversations',
    label: 'Conversations',
    icon: MessagesSquare,
    variant: 'neutral',
    helpText: 'Active threads',
  },
  {
    key: 'totalGroups',
    label: 'Groups',
    icon: Users,
    variant: 'neutral',
    helpText: 'Multi-party conversations',
  },
  {
    key: 'messagesLast24h',
    label: 'Messages (24h)',
    icon: MessageSquare,
    variant: 'brand',
  },
  {
    key: 'messagesLast7d',
    label: 'Messages (7d)',
    icon: MessageSquare,
    variant: 'brand',
  },
  {
    key: 'pendingReports',
    label: 'Pending reports',
    icon: ShieldAlert,
    variant: 'warning',
    helpText: 'Awaiting moderator review',
  },
];

const RECENT_REPORTS_LIMIT = 5;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [state, setState] = useState({
    loading: true,
    error: null,
    stats: null,
    recentReports: [],
  });

  const fetchAll = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [statsResult, reportsResult] = await Promise.all([
        getStats(),
        listReports({ status: 'pending', limit: RECENT_REPORTS_LIMIT }),
      ]);
      setState({
        loading: false,
        error: null,
        stats: statsResult?.data ?? null,
        recentReports: reportsResult?.data?.reports ?? [],
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Failed to load dashboard.';
      setState({
        loading: false,
        error: message,
        stats: null,
        recentReports: [],
      });
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Admin dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Real-time platform health and the latest pending reports.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAll}
          disabled={state.loading}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Refresh</span>
        </button>
      </header>

      {state.error ? (
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load dashboard"
          description={state.error}
          action={
            <button
              type="button"
              onClick={fetchAll}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Try again
            </button>
          }
        />
      ) : (
        <>
          <section
            aria-label="Platform metrics"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {STAT_TILES.map((tile) => (
              <StatsCard
                key={tile.key}
                label={tile.label}
                icon={tile.icon}
                variant={tile.variant}
                helpText={tile.helpText}
                value={state.stats?.[tile.key] ?? 0}
                loading={state.loading}
              />
            ))}
          </section>

          <section aria-labelledby="recent-reports-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                id="recent-reports-heading"
                className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"
              >
                <Flag className="h-4 w-4 text-amber-500" aria-hidden="true" />
                Recent pending reports
              </h2>
              <Link
                to="/admin/reports"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {state.loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : state.recentReports.length === 0 ? (
              <EmptyState
                icon={Flag}
                title="No pending reports"
                description="All caught up — the queue is empty."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="w-full table-fixed text-left">
                  <thead className="bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                    <tr>
                      <th className="w-32 px-3 py-2">Target</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="w-28 px-3 py-2">Status</th>
                      <th className="hidden w-24 px-3 py-2 md:table-cell">
                        Age
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.recentReports.map((report) => (
                      <ReportRow
                        key={report._id}
                        report={report}
                        compact
                        onSelect={() =>
                          navigate(`/admin/reports?focus=${report._id}`)
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
