import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

import EmptyState from '../../components/common/EmptyState.jsx';
import Modal from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import Avatar from '../../components/common/Avatar.jsx';
import Badge from '../../components/common/Badge.jsx';
import CharacterCounter from '../../components/common/CharacterCounter.jsx';
import AdminTableSkeleton from '../../components/common/skeletons/AdminTableSkeleton.jsx';
import ReportRow from '../../components/admin/ReportRow.jsx';
import {
  forceDeleteMessage,
  getReport,
  listReports,
  updateReport,
  updateUserStatus,
} from '../../api/admin.service.js';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

/**
 * AdminReports — moderator queue at `/admin/reports`.
 *
 * Two-pane behaviour:
 *   - The table is the persistent list (filterable, paginated).
 *   - Clicking a row opens a `<Modal>` populated by `getReport`,
 *     which returns both the report row AND the polymorphic target
 *     (user / message / conversation). We don't optimistically
 *     reuse the row data because the table omits the long
 *     description and the populated target.
 *
 * Action mapping (status enums match `REPORT_STATUSES` on the server):
 *   - "Dismiss"           → status: dismissed
 *   - "Mark reviewed"     → status: reviewed
 *   - "Take action"       → status: actionTaken + a side-effect:
 *                              user report    → suspend the reported user
 *                              message report → force-delete the message
 *                              conversation   → status only (no destructive
 *                                                action surfaced here; admins
 *                                                can dive into the conversation
 *                                                via AdminMessages if needed)
 *   `reviewNote` is sanitised + length-capped server-side; we mirror
 *   the cap here to give the user a live counter.
 *
 * Deep-link: the dashboard passes `?focus=<reportId>` to auto-open the
 * modal for a specific report. We strip the param after opening so a
 * subsequent close + back-navigation doesn't reopen it.
 */

const PAGE_SIZE = 20;
const REVIEW_NOTE_MAX = 500;

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'actionTaken', label: 'Action taken' },
];

const TARGET_FILTER_OPTIONS = [
  { value: '', label: 'All targets' },
  { value: 'user', label: 'User' },
  { value: 'message', label: 'Message' },
  { value: 'conversation', label: 'Conversation' },
];

const REASON_LABEL = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  other: 'Other',
};

const initialState = {
  loading: true,
  error: null,
  reports: [],
  page: 1,
  totalPages: 1,
  total: 0,
};

const AdminReports = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState({ status: '', targetType: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState(initialState);

  const [activeReportId, setActiveReportId] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(null);

  /* Reset to page 1 on filter changes (mirrors AdminUsers). */
  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.targetType]);

  const fetchReports = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await listReports({
        status: filters.status || undefined,
        targetType: filters.targetType || undefined,
        page,
        limit: PAGE_SIZE,
      });
      const data = result?.data ?? {};
      setState({
        loading: false,
        error: null,
        reports: data.reports ?? [],
        page: data.page ?? page,
        totalPages: data.totalPages ?? 1,
        total: data.total ?? 0,
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Failed to load reports.';
      setState({ ...initialState, loading: false, error: message });
    }
  }, [filters.status, filters.targetType, page]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  /* ---------- Detail open / close ---------- */

  const openReport = useCallback(
    async (reportId) => {
      if (!reportId) return;
      setActiveReportId(reportId);
      setActiveReport(null);
      setReviewNote('');
      setActiveLoading(true);
      try {
        const result = await getReport(reportId);
        setActiveReport(result?.data ?? null);
        setReviewNote(result?.data?.report?.reviewNote || '');
      } catch (err) {
        const message =
          err?.response?.data?.message || 'Failed to load report.';
        toast.error(message);
        setActiveReportId(null);
      } finally {
        setActiveLoading(false);
      }
    },
    [],
  );

  const closeReport = useCallback(() => {
    if (reviewBusy) return;
    setActiveReportId(null);
    setActiveReport(null);
    setReviewNote('');
    if (searchParams.get('focus')) {
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [reviewBusy, searchParams, setSearchParams]);

  /* Auto-open from `?focus=<id>` deep-link. */
  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (focusId && focusId !== activeReportId) {
      openReport(focusId);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [searchParams]);

  /* ---------- Review actions ---------- */

  const replaceReportInList = useCallback((reportId, patch) => {
    setState((prev) => ({
      ...prev,
      reports: prev.reports.map((r) =>
        r._id === reportId ? { ...r, ...patch } : r,
      ),
    }));
  }, []);

  const submitReview = useCallback(
    async ({ status, sideEffectKey = null, sideEffect = null }) => {
      if (!activeReport?.report) return;
      const reportId = activeReport.report._id;
      const note = reviewNote.trim();
      setReviewBusy(sideEffectKey ?? status);
      try {
        if (sideEffect) await sideEffect();
        const result = await updateReport(reportId, {
          status,
          ...(note ? { reviewNote: note } : {}),
        });
        const updated = result?.data?.report;
        if (updated) {
          replaceReportInList(reportId, {
            status: updated.status,
            reviewedBy: updated.reviewedBy,
            reviewNote: updated.reviewNote,
          });
        }
        toast.success('Report updated · Logged');
        closeReport();
      } catch (err) {
        const message =
          err?.response?.data?.message || 'Could not update report.';
        toast.error(message);
      } finally {
        setReviewBusy(null);
      }
    },
    [activeReport, reviewNote, replaceReportInList, closeReport],
  );

  /* ---------- Derived ---------- */

  const summary = useMemo(() => {
    if (state.loading) return 'Loading reports…';
    if (state.total === 0) return 'No reports match these filters.';
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, state.total);
    return `Showing ${start}–${end} of ${state.total}`;
  }, [page, state.loading, state.total]);

  const goToPage = (next) => {
    if (next < 1 || next > state.totalPages || next === page) return;
    setPage(next);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Abuse reports
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{summary}</p>
        </div>
        <button
          type="button"
          onClick={fetchReports}
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

      <section
        aria-label="Filters"
        className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-900/40"
      >
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, status: event.target.value }))
          }
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by target type"
          value={filters.targetType}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, targetType: event.target.value }))
          }
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        >
          {TARGET_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      {state.loading ? (
        <AdminTableSkeleton rows={6} columns={5} />
      ) : state.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load reports"
          description={state.error}
          action={
            <button
              type="button"
              onClick={fetchReports}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Try again
            </button>
          }
        />
      ) : state.reports.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No reports here"
          description="The queue is empty for the current filters."
        />
      ) : (
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
              <tr>
                <th className="w-32 px-3 py-2">Target</th>
                <th className="px-3 py-2">Reason</th>
                <th className="hidden w-44 px-3 py-2 sm:table-cell">
                  Reporter
                </th>
                <th className="w-28 px-3 py-2">Status</th>
                <th className="hidden w-24 px-3 py-2 md:table-cell">Age</th>
              </tr>
            </thead>
            <tbody>
              {state.reports.map((report) => (
                <ReportRow
                  key={report._id}
                  report={report}
                  onSelect={() => openReport(report._id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.totalPages > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-sm"
        >
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Previous</span>
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} of {state.totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= state.totalPages}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      ) : null}

      <ReportDetailModal
        open={Boolean(activeReportId)}
        loading={activeLoading}
        report={activeReport?.report}
        target={activeReport?.target}
        reviewNote={reviewNote}
        onReviewNoteChange={setReviewNote}
        reviewBusy={reviewBusy}
        onClose={closeReport}
        onDismiss={() => submitReview({ status: 'dismissed' })}
        onMarkReviewed={() => submitReview({ status: 'reviewed' })}
        onTakeAction={() => {
          const report = activeReport?.report;
          const target = activeReport?.target;
          if (!report || !target) return;
          if (report.targetType === 'user' && target.role === 'admin') {
            toast.error(
              'Admin accounts cannot be moderated from this panel.',
            );
            return;
          }
          if (report.targetType === 'message') {
            submitReview({
              status: 'actionTaken',
              sideEffectKey: 'action',
              sideEffect: () => forceDeleteMessage(target._id),
            });
          } else if (report.targetType === 'user') {
            submitReview({
              status: 'actionTaken',
              sideEffectKey: 'action',
              sideEffect: () =>
                updateUserStatus(target._id, { status: 'suspended' }),
            });
          } else {
            submitReview({ status: 'actionTaken', sideEffectKey: 'action' });
          }
        }}
      />
    </div>
  );
};

/* -------------------- Detail modal -------------------- */

const STATUS_LABEL = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
  actionTaken: 'Action taken',
};

const STATUS_VARIANT = {
  pending: 'warning',
  reviewed: 'brand',
  dismissed: 'neutral',
  actionTaken: 'success',
};

const ReportDetailModal = ({
  open,
  loading,
  report,
  target,
  reviewNote,
  onReviewNoteChange,
  reviewBusy,
  onClose,
  onDismiss,
  onMarkReviewed,
  onTakeAction,
}) => {
  const isFinalised =
    report?.status && report.status !== 'pending';

  const actionLabel = useMemo(() => {
    if (!report) return 'Take action';
    if (report.targetType === 'message') return 'Force-delete message';
    if (report.targetType === 'user') return 'Suspend user';
    return 'Mark as actioned';
  }, [report]);

  const actionDisabled =
    !report ||
    !target ||
    (report.targetType === 'user' && target.role === 'admin');

  const targetTitle = report
    ? report.targetType.charAt(0).toUpperCase() + report.targetType.slice(1)
    : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report detail"
      description={
        report
          ? `Filed ${formatRelativeTime(report.createdAt)} · ${REASON_LABEL[report.reason] ?? report.reason}`
          : undefined
      }
      size="lg"
      closeOnBackdrop={!reviewBusy}
      closeOnEscape={!reviewBusy}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(reviewBusy)}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Close
          </button>
          <FooterAction
            label="Dismiss"
            tone="neutral"
            busy={reviewBusy === 'dismissed'}
            disabled={Boolean(reviewBusy) || !report}
            onClick={onDismiss}
          />
          <FooterAction
            label="Mark reviewed"
            tone="brand"
            busy={reviewBusy === 'reviewed'}
            disabled={Boolean(reviewBusy) || !report}
            onClick={onMarkReviewed}
          />
          <FooterAction
            label={actionLabel}
            tone="danger"
            busy={reviewBusy === 'action'}
            disabled={Boolean(reviewBusy) || actionDisabled}
            onClick={onTakeAction}
          />
        </div>
      }
    >
      {loading || !report ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="space-y-5 px-5 py-4 text-sm">
          <section className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[report.status] ?? 'neutral'}>
              {STATUS_LABEL[report.status] ?? report.status}
            </Badge>
            <Badge variant="neutral">{targetTitle}</Badge>
            <Badge variant="neutral">
              {REASON_LABEL[report.reason] ?? report.reason}
            </Badge>
            {isFinalised && report.reviewedBy ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Reviewed by{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  @{report.reviewedBy.username}
                </span>
              </span>
            ) : null}
          </section>

          {report.description ? (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Reporter description
              </h3>
              <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                {report.description}
              </p>
            </section>
          ) : null}

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Reporter
            </h3>
            <ReporterChip user={report.reporter} />
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Reported {report.targetType}
            </h3>
            <TargetPreview type={report.targetType} target={target} />
          </section>

          <section>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Review note (optional)
              </span>
              <textarea
                value={reviewNote}
                onChange={(event) =>
                  onReviewNoteChange(
                    event.target.value.slice(0, REVIEW_NOTE_MAX),
                  )
                }
                rows={3}
                maxLength={REVIEW_NOTE_MAX}
                disabled={Boolean(reviewBusy)}
                placeholder="Internal note for the audit log…"
                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <CharacterCounter
                current={reviewNote.length}
                max={REVIEW_NOTE_MAX}
                className="mt-1"
              />
            </label>
          </section>
        </div>
      )}
    </Modal>
  );
};

const ReporterChip = ({ user }) => {
  if (!user) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Reporter no longer available.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
      <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {user.displayName || user.username}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          @{user.username}
          {user.email ? ` · ${user.email}` : ''}
        </p>
      </div>
    </div>
  );
};

/**
 * `auditHref` derives the deep-link admins use to jump into the audit
 * window for the reported message/conversation. We keep the logic local
 * to the preview because only this component knows the `target` shape
 * for each `targetType` — pushing it up to the modal would force the
 * caller to re-discriminate on type.
 */
const auditHrefForTarget = (type, target) => {
  if (!target) return null;
  if (type === 'message' && target.conversationId) {
    return `/admin/messages?id=${target.conversationId}`;
  }
  if (type === 'conversation' && target._id) {
    return `/admin/messages?id=${target._id}`;
  }
  return null;
};

const AuditLink = ({ href, label }) => (
  <Link
    to={href}
    className="inline-flex items-center gap-1 self-start rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-900/60 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
  >
    <ExternalLink className="h-3 w-3" aria-hidden="true" />
    <span>{label}</span>
  </Link>
);

const TargetPreview = ({ type, target }) => {
  if (!target) {
    return (
      <p className="rounded-md border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
        Target no longer exists. The report row is preserved for the
        audit trail.
      </p>
    );
  }

  if (type === 'user') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-3 dark:border-gray-800">
        <Avatar src={target.avatarUrl} name={target.displayName} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {target.displayName || target.username}
            </p>
            <Badge variant="neutral">{target.role}</Badge>
            <Badge
              variant={
                target.status === 'active'
                  ? 'success'
                  : target.status === 'suspended'
                    ? 'danger'
                    : 'neutral'
              }
            >
              {target.status}
            </Badge>
          </div>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            @{target.username}
            {target.email ? ` · ${target.email}` : ''}
          </p>
        </div>
      </div>
    );
  }

  if (type === 'message') {
    const auditHref = auditHrefForTarget(type, target);
    return (
      <div className="space-y-2 rounded-md border border-gray-200 px-3 py-3 dark:border-gray-800">
        {target.sender ? (
          <div className="flex items-center gap-2">
            <Avatar
              src={target.sender.avatarUrl}
              name={target.sender.displayName}
              size="xs"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              @{target.sender.username}
            </span>
          </div>
        ) : (
          <span className="text-xs italic text-gray-400 dark:text-gray-500">
            Sender deleted
          </span>
        )}
        {target.text ? (
          <p className="whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:bg-gray-900/60 dark:text-gray-100">
            {target.text}
          </p>
        ) : null}
        {target.imageUrl ? (
          <img
            src={target.imageUrl}
            alt="Reported attachment"
            className="max-h-48 rounded-md border border-gray-200 object-cover dark:border-gray-800"
          />
        ) : null}
        {!target.text && !target.imageUrl ? (
          <p className="text-xs italic text-gray-400 dark:text-gray-500">
            Message content has been removed.
          </p>
        ) : null}
        {auditHref ? (
          <AuditLink href={auditHref} label="Open conversation in audit" />
        ) : null}
      </div>
    );
  }

  if (type === 'conversation') {
    const participants = target.participants ?? [];
    const auditHref = auditHrefForTarget(type, target);
    return (
      <div className="rounded-md border border-gray-200 px-3 py-3 dark:border-gray-800">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {target.name || (target.type === 'group' ? 'Untitled group' : 'Direct chat')}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {target.type} · {participants.length} participant
          {participants.length === 1 ? '' : 's'}
        </p>
        {participants.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {participants.slice(0, 6).map((p) => (
              <li
                key={p._id}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <Avatar src={p.avatarUrl} name={p.displayName} size="xs" />
                <span>@{p.username}</span>
              </li>
            ))}
            {participants.length > 6 ? (
              <li className="text-[11px] text-gray-400">
                +{participants.length - 6} more
              </li>
            ) : null}
          </ul>
        ) : null}
        {auditHref ? (
          <div className="mt-3">
            <AuditLink href={auditHref} label="Open in audit" />
          </div>
        ) : null}
      </div>
    );
  }

  return null;
};

const TONE_FOOTER = {
  neutral:
    'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800',
  brand:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

const FooterAction = ({ label, tone, busy, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-gray-950 ${
      TONE_FOOTER[tone] ?? TONE_FOOTER.brand
    }`}
  >
    {busy ? (
      <span
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
      />
    ) : null}
    <span>{label}</span>
  </button>
);

export default AdminReports;
