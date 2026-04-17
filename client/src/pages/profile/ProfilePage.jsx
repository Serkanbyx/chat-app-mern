import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  Flag,
  MessageSquare,
  Pencil,
  ShieldOff,
  UserCheck,
  UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Avatar from '../../components/common/Avatar.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import BlockUserModal from '../../components/modals/BlockUserModal.jsx';
import ReportModal from '../../components/modals/ReportModal.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { getProfile, blockUser, unblockUser } from '../../api/user.service.js';
import { createDirect } from '../../api/conversation.service.js';

/**
 * ProfilePage — public profile at `/u/:username`.
 *
 * Two viewer modes co-exist on the same URL:
 *   - Self ("isSelf"): primary CTA is "Edit profile" → /settings/profile.
 *   - Other: primary CTA is "Send message" (creates/opens a direct
 *     conversation), with secondary actions for Block/Unblock and
 *     Report.
 *
 * SECURITY:
 *   - Email is never rendered here; the public projection on the
 *     server (`PUBLIC_USER_PROJECTION`) doesn't include it but we also
 *     guard at the call site so a future server change can't leak PII.
 *   - The page hides the Block/Unblock/Report buttons for self so the
 *     user can't accidentally try to block themselves (the API would
 *     reject it but the UI shouldn't tempt the click in the first
 *     place).
 *   - 404 / blocked / suspended targets return the same EmptyState so
 *     the URL doesn't disclose which of those conditions applies.
 */

const formatJoinDate = (input) => {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const ProfilePage = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: viewer, updateUser } = useAuth();
  const { onlineUserIds } = useSocket();

  const [state, setState] = useState({
    loading: true,
    error: null,
    user: null,
    relationship: null,
  });
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);

  const refresh = useCallback(async () => {
    if (!username) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await getProfile(username);
      setState({
        loading: false,
        error: null,
        user: result?.data?.user ?? null,
        relationship: result?.data?.relationship ?? null,
      });
    } catch (err) {
      const status = err?.response?.status;
      setState({
        loading: false,
        error:
          status === 404
            ? 'not_found'
            : err?.response?.data?.message || 'Failed to load profile.',
        user: null,
        relationship: null,
      });
    }
  }, [username]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const targetUser = state.user;
  const isSelf = Boolean(state.relationship?.isSelf);
  const isBlockedByMe = Boolean(state.relationship?.isBlockedByMe);
  const isOnline = targetUser
    ? onlineUserIds?.has?.(String(targetUser._id)) || Boolean(targetUser.isOnline)
    : false;

  /* ---------- Actions ---------- */

  const handleSendMessage = async () => {
    if (!targetUser || actionInFlight) return;
    setActionInFlight(true);
    try {
      const result = await createDirect(targetUser._id);
      const conversationId = result?.data?.conversation?._id;
      if (conversationId) {
        navigate(`/chat/${conversationId}`);
      } else {
        navigate('/chat');
      }
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Could not start the conversation.';
      toast.error(message);
    } finally {
      setActionInFlight(false);
    }
  };

  const handleBlockConfirm = async () => {
    if (!targetUser) return;
    await blockUser(targetUser._id);
    toast.success(`${targetUser.displayName || targetUser.username} blocked.`);

    /* Mirror the server-side mutation in the local viewer cache so the
     * navbar avatar dropdown / other surfaces immediately reflect the
     * change without waiting for a `/auth/me` round-trip. */
    if (viewer) {
      updateUser((prev) => {
        const next = { ...prev };
        const current = Array.isArray(prev.blockedUsers)
          ? prev.blockedUsers
          : [];
        const alreadyHas = current.some((entry) => {
          const id = entry?.user?._id ?? entry?.user ?? entry;
          return String(id) === String(targetUser._id);
        });
        if (!alreadyHas) {
          next.blockedUsers = [
            ...current,
            { user: targetUser._id, blockedAt: new Date().toISOString() },
          ];
        }
        return next;
      });
    }

    setBlockModalOpen(false);
    setState((prev) => ({
      ...prev,
      relationship: { ...(prev.relationship ?? {}), isBlockedByMe: true },
    }));
  };

  const handleUnblock = async () => {
    if (!targetUser || actionInFlight) return;
    setActionInFlight(true);
    try {
      await unblockUser(targetUser._id);
      toast.success(`${targetUser.displayName || targetUser.username} unblocked.`);
      if (viewer) {
        updateUser((prev) => {
          const next = { ...prev };
          const current = Array.isArray(prev.blockedUsers)
            ? prev.blockedUsers
            : [];
          next.blockedUsers = current.filter((entry) => {
            const id = entry?.user?._id ?? entry?.user ?? entry;
            return String(id) !== String(targetUser._id);
          });
          return next;
        });
      }
      setState((prev) => ({
        ...prev,
        relationship: { ...(prev.relationship ?? {}), isBlockedByMe: false },
      }));
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Could not unblock user.';
      toast.error(message);
    } finally {
      setActionInFlight(false);
    }
  };

  /* ---------- Render branches ---------- */

  if (state.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state.error || !targetUser) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          title="Profile unavailable"
          description="This account may not exist or is no longer available."
          action={
            <Link
              to="/chat"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Back to chat
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {/* Banner */}
          <div className="h-24 bg-linear-to-r from-brand-500 via-brand-600 to-brand-700 sm:h-32 dark:from-brand-700 dark:via-brand-800 dark:to-brand-900" />

          <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="-mt-12 flex flex-col items-start gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-3">
                <div className="ring-4 ring-white dark:ring-gray-900">
                  <Avatar
                    src={targetUser.avatarUrl}
                    name={targetUser.displayName || targetUser.username}
                    size="xl"
                    online={isOnline}
                    showStatus={!isSelf}
                  />
                </div>
                <div className="pb-1 sm:pb-2">
                  <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl dark:text-white">
                    {targetUser.displayName || targetUser.username}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    @{targetUser.username}
                  </p>
                </div>
              </div>

              {/* Action cluster */}
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {isSelf ? (
                  <Link
                    to="/settings/profile"
                    className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    <span>Edit profile</span>
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={actionInFlight || isBlockedByMe}
                      className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      <span>Send message</span>
                    </button>

                    {isBlockedByMe ? (
                      <button
                        type="button"
                        onClick={handleUnblock}
                        disabled={actionInFlight}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <UserCheck className="h-4 w-4" aria-hidden="true" />
                        <span>Unblock</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBlockModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <UserX className="h-4 w-4" aria-hidden="true" />
                        <span>Block</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setReportModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-gray-700 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Flag className="h-4 w-4" aria-hidden="true" />
                      <span>Report</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Bio + meta */}
            <div className="mt-6 space-y-4">
              {targetUser.bio ? (
                <p className="text-sm whitespace-pre-line text-gray-700 dark:text-gray-200">
                  {targetUser.bio}
                </p>
              ) : (
                <p className="text-sm italic text-gray-400 dark:text-gray-500">
                  {isSelf
                    ? 'You haven\u2019t added a bio yet.'
                    : 'No bio yet.'}
                </p>
              )}

              <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
                {targetUser.createdAt ? (
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    <dt className="sr-only">Joined</dt>
                    <dd>Joined {formatJoinDate(targetUser.createdAt)}</dd>
                  </div>
                ) : null}

                {!isSelf ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 rounded-full ${
                        isOnline
                          ? 'bg-emerald-500'
                          : 'bg-gray-400 dark:bg-gray-600'
                      }`}
                    />
                    <dt className="sr-only">Status</dt>
                    <dd>{isOnline ? 'Online' : 'Offline'}</dd>
                  </div>
                ) : null}

                {isBlockedByMe ? (
                  <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <dd>You have blocked this user.</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </article>
      </div>

      <BlockUserModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        onConfirm={handleBlockConfirm}
        target={targetUser}
      />

      <ReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        targetType="user"
        targetId={targetUser?._id}
        targetLabel={targetUser?.displayName || `@${targetUser?.username}`}
      />
    </>
  );
};

export default ProfilePage;
