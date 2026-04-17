import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  ImagePlus,
  Loader2,
  LogOut,
  Pencil,
  Shield,
  ShieldOff,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';

import Avatar from '../common/Avatar.jsx';
import Modal from '../common/Modal.jsx';
import PresenceDot from './PresenceDot.jsx';
import UserSearchInput from './UserSearchInput.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import * as conversationService from '../../api/conversation.service.js';
import { uploadGroupAvatar } from '../../api/upload.service.js';
import { GROUP_RULES } from '../../utils/constants.js';

/**
 * GroupSettingsModal — single surface for managing every member-facing
 * aspect of a group conversation. Opened from `ChatHeader` when the user
 * taps the group identity row.
 *
 * Sections:
 *   - Members  → roster with role badges + per-row admin actions.
 *   - Add      → admin-only `UserSearchInput` (multi-select) wired to
 *                `addMembers`. Existing members are excluded client-side
 *                so the row never appears as a duplicate.
 *   - Notifications → per-user mute toggle (persists in
 *                `User.mutedConversations`).
 *   - Danger zone   → "Leave group" (any participant) and a contextual
 *                "Delete group" affordance that maps to leave-as-last-admin
 *                (the server tombstones the doc instead of hard-deleting,
 *                preserving the audit trail).
 *
 * Why everything lives in one modal instead of separate dialogs:
 *   The actions form a cohesive "manage this chat" task. Splitting them
 *   would force the user to dismiss/reopen four overlays to do something
 *   common like "rename + add a member + leave a draft of this for later".
 *   A tabbed surface keeps the cognitive load low while still letting the
 *   admin-only rails stay hidden for plain members (no taunting greyed
 *   buttons).
 *
 * State ownership:
 *   The live `conversation` is owned by `ChatPage` (the parent) so socket
 *   echoes (`group:updated`, `group:adminChanged`, …) can flow into it
 *   without going through the modal. After every mutation we call
 *   `onConversationUpdated` with the server's authoritative payload so
 *   the parent can patch its slice AND update the sidebar list in one go.
 *
 * SECURITY:
 *   - Every admin action is re-validated server-side (`assertGroupAdmin`).
 *     The UI hides controls as a UX courtesy; never as a security gate.
 *   - Member rows show `displayName`, avatar, and presence (only when
 *     the member's own privacy preference allows). Email is never read
 *     into this component.
 *   - "Promote/Demote self" is disabled — a user manipulating their own
 *     admin status here would bypass the cooperative governance model
 *     (the only legitimate self-demote path is to leave the group).
 *   - "Delete group" is intentionally a thin wrapper around the same
 *     `DELETE /:id` endpoint as "Leave group"; the server alone decides
 *     whether to mark `isActive: false` based on remaining membership.
 */

const TABS = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'add', label: 'Add', icon: UserMinus, adminOnly: true },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'danger', label: 'Danger zone', icon: AlertTriangle },
];

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = GROUP_RULES.AVATAR_MAX_SIZE_MB * 1024 * 1024;

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const GroupSettingsModal = ({
  open,
  conversation,
  onClose,
  onConversationUpdated,
}) => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { onlineUserIds } = useSocket();
  const { upsertConversation, removeConversation } = useChatState();

  const currentUserId = user?._id ? String(user._id) : null;
  const conversationId = conversation?._id ? String(conversation._id) : null;

  /* ---------- Derived membership info ----------
   * Memoised so every row in the Members list doesn't recompute the
   * admin set on each render. */
  const adminIds = useMemo(
    () => new Set((conversation?.admins ?? []).map((id) => String(id))),
    [conversation?.admins],
  );
  const participantIds = useMemo(
    () => (conversation?.participants ?? []).map(idOf),
    [conversation?.participants],
  );
  const isGroup = conversation?.type === 'group';
  const isCurrentUserAdmin = currentUserId
    ? adminIds.has(currentUserId)
    : false;
  const isSoleAdmin =
    isCurrentUserAdmin && (conversation?.admins?.length ?? 0) === 1;

  const isMuted = useMemo(() => {
    if (!conversationId) return false;
    return (user?.mutedConversations ?? []).some(
      (id) => String(id) === conversationId,
    );
  }, [conversationId, user?.mutedConversations]);

  /* ---------- Tab state ----------
   * Reset to "members" on every open so the modal never reopens on a
   * stale tab the user can't see (e.g. "add" after they were demoted). */
  const [activeTab, setActiveTab] = useState('members');
  useEffect(() => {
    if (open) setActiveTab('members');
  }, [open]);

  // If the current user loses admin while the "add" tab is selected,
  // bounce them back to the visible members tab so the body never
  // renders an empty surface.
  useEffect(() => {
    if (activeTab === 'add' && !isCurrentUserAdmin) setActiveTab('members');
  }, [activeTab, isCurrentUserAdmin]);

  /* ---------- Header: rename + avatar (admin only) ---------- */
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setIsEditingName(false);
      setDraftName('');
    }
  }, [open]);

  const handleStartRename = useCallback(() => {
    if (!isCurrentUserAdmin) return;
    setDraftName(conversation?.name ?? '');
    setIsEditingName(true);
  }, [conversation?.name, isCurrentUserAdmin]);

  const handleCancelRename = useCallback(() => {
    setIsEditingName(false);
    setDraftName('');
  }, []);

  const handleSaveName = useCallback(async () => {
    if (!conversationId || isSavingName) return;
    const trimmed = draftName.trim();
    if (trimmed.length === 0) {
      toast.error('Group name cannot be empty.');
      return;
    }
    if (trimmed === conversation?.name) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const result = await conversationService.updateGroup(conversationId, {
        name: trimmed,
      });
      const updated = result?.data;
      if (updated) {
        onConversationUpdated?.(updated);
        upsertConversation(updated);
      }
      toast.success('Group renamed.');
      setIsEditingName(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not rename group.');
    } finally {
      setIsSavingName(false);
    }
  }, [
    conversation?.name,
    conversationId,
    draftName,
    isSavingName,
    onConversationUpdated,
    upsertConversation,
  ]);

  const handleAvatarPick = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !conversationId || isUploadingAvatar) return;

      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        toast.error('Avatar must be a JPEG, PNG, or WEBP image.');
        return;
      }
      if (file.size > MAX_AVATAR_BYTES) {
        toast.error(
          `Image must be smaller than ${GROUP_RULES.AVATAR_MAX_SIZE_MB} MB.`,
        );
        return;
      }

      setIsUploadingAvatar(true);
      try {
        const upload = await uploadGroupAvatar(file);
        const url = upload?.data?.url ?? '';
        if (!url) throw new Error('Upload did not return a URL.');

        const result = await conversationService.updateGroup(conversationId, {
          avatarUrl: url,
        });
        const updated = result?.data;
        if (updated) {
          onConversationUpdated?.(updated);
          upsertConversation(updated);
        }
        toast.success('Group photo updated.');
      } catch (err) {
        toast.error(
          err?.response?.data?.message ||
            err?.message ||
            'Could not update group photo.',
        );
      } finally {
        setIsUploadingAvatar(false);
      }
    },
    [
      conversationId,
      isUploadingAvatar,
      onConversationUpdated,
      upsertConversation,
    ],
  );

  /* ---------- Per-row member actions (admin) ----------
   * `busyMemberId` provides a single-row spinner so the rest of the list
   * stays interactive. The map-of-busys was overkill: a group has at
   * most one in-flight admin action at a time. */
  const [busyMemberId, setBusyMemberId] = useState(null);

  const applyConversationUpdate = useCallback(
    (updated) => {
      if (!updated?._id) return;
      onConversationUpdated?.(updated);
      upsertConversation(updated);
    },
    [onConversationUpdated, upsertConversation],
  );

  const handlePromoteOrDemote = useCallback(
    async (memberId, makeAdmin) => {
      if (!conversationId || busyMemberId) return;
      const targetId = String(memberId);
      if (targetId === currentUserId) return;
      setBusyMemberId(targetId);
      try {
        const result = await conversationService.promoteAdmin(
          conversationId,
          targetId,
          { promote: makeAdmin },
        );
        applyConversationUpdate(result?.data);
        toast.success(makeAdmin ? 'Promoted to admin.' : 'Admin removed.');
      } catch (err) {
        toast.error(
          err?.response?.data?.message ||
            (makeAdmin ? 'Could not promote member.' : 'Could not demote member.'),
        );
      } finally {
        setBusyMemberId(null);
      }
    },
    [applyConversationUpdate, busyMemberId, conversationId, currentUserId],
  );

  const handleRemoveMember = useCallback(
    async (memberId, displayName) => {
      if (!conversationId || busyMemberId) return;
      const targetId = String(memberId);
      if (targetId === currentUserId) return;
      const ok = window.confirm(
        `Remove ${displayName || 'this member'} from the group?`,
      );
      if (!ok) return;
      setBusyMemberId(targetId);
      try {
        const result = await conversationService.removeMember(
          conversationId,
          targetId,
        );
        applyConversationUpdate(result?.data);
        toast.success('Member removed.');
      } catch (err) {
        toast.error(
          err?.response?.data?.message || 'Could not remove member.',
        );
      } finally {
        setBusyMemberId(null);
      }
    },
    [applyConversationUpdate, busyMemberId, conversationId, currentUserId],
  );

  /* ---------- Add members (admin) ---------- */
  const [pendingAdds, setPendingAdds] = useState([]);
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  useEffect(() => {
    if (!open) setPendingAdds([]);
  }, [open]);

  // Drop any pending picks that became members through another device /
  // admin while the modal was open — re-adding would just hit the
  // "already a member" 4xx.
  useEffect(() => {
    if (pendingAdds.length === 0) return;
    const memberSet = new Set(participantIds);
    const filtered = pendingAdds.filter((u) => !memberSet.has(idOf(u)));
    if (filtered.length !== pendingAdds.length) {
      setPendingAdds(filtered);
    }
  }, [participantIds, pendingAdds]);

  const togglePendingAdd = useCallback((target) => {
    const targetId = idOf(target);
    if (!targetId) return;
    setPendingAdds((prev) => {
      const exists = prev.some((entry) => idOf(entry) === targetId);
      if (exists) return prev.filter((entry) => idOf(entry) !== targetId);
      return [...prev, target];
    });
  }, []);

  const handleSubmitAdds = useCallback(async () => {
    if (!conversationId || isAddingMembers || pendingAdds.length === 0) return;
    setIsAddingMembers(true);
    try {
      const result = await conversationService.addMembers(
        conversationId,
        pendingAdds.map(idOf),
      );
      applyConversationUpdate(result?.data);
      toast.success(
        `${pendingAdds.length} ${pendingAdds.length === 1 ? 'member' : 'members'} added.`,
      );
      setPendingAdds([]);
      setActiveTab('members');
    } catch (err) {
      toast.error(
        err?.response?.data?.message || 'Could not add members.',
      );
    } finally {
      setIsAddingMembers(false);
    }
  }, [
    applyConversationUpdate,
    conversationId,
    isAddingMembers,
    pendingAdds,
  ]);

  /* ---------- Notifications ---------- */
  const [isMuting, setIsMuting] = useState(false);
  const handleToggleMute = useCallback(async () => {
    if (!conversationId || isMuting) return;
    setIsMuting(true);
    // Optimistic flip on the local user. The REST response carries the
    // canonical mutedConversations array so a concurrent mutation from
    // another device will reconcile after the round-trip.
    updateUser((prev) => {
      if (!prev) return prev;
      const list = prev.mutedConversations ?? [];
      const exists = list.some((id) => String(id) === conversationId);
      const nextList = exists
        ? list.filter((id) => String(id) !== conversationId)
        : [...list, conversationId];
      return { ...prev, mutedConversations: nextList };
    });
    try {
      const result = await conversationService.toggleMute(conversationId);
      const serverList = result?.data?.mutedConversations;
      if (Array.isArray(serverList)) {
        updateUser({ mutedConversations: serverList });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update mute.');
      // Revert by flipping again — we never assumed authoritative state.
      updateUser((prev) => {
        if (!prev) return prev;
        const list = prev.mutedConversations ?? [];
        const exists = list.some((id) => String(id) === conversationId);
        const nextList = exists
          ? list.filter((id) => String(id) !== conversationId)
          : [...list, conversationId];
        return { ...prev, mutedConversations: nextList };
      });
    } finally {
      setIsMuting(false);
    }
  }, [conversationId, isMuting, updateUser]);

  /* ---------- Danger zone ---------- */
  const [isLeaving, setIsLeaving] = useState(false);
  const handleLeaveOrDelete = useCallback(
    async ({ asDelete }) => {
      if (!conversationId || isLeaving) return;
      const promptMessage = asDelete
        ? `Delete the group "${conversation?.name}"? You're the only admin — the group will be closed for everyone. Past messages remain on every member's device. This cannot be undone.`
        : `Leave the group "${conversation?.name}"?`;
      const ok = window.confirm(promptMessage);
      if (!ok) return;
      setIsLeaving(true);
      try {
        await conversationService.leaveOrDeleteConversation(conversationId);
        removeConversation(conversationId);
        toast.success(asDelete ? 'Group closed.' : 'You left the group.');
        onClose?.();
        navigate('/chat', { replace: true });
      } catch (err) {
        toast.error(
          err?.response?.data?.message ||
            (asDelete ? 'Could not delete group.' : 'Could not leave group.'),
        );
      } finally {
        setIsLeaving(false);
      }
    },
    [
      conversation?.name,
      conversationId,
      isLeaving,
      navigate,
      onClose,
      removeConversation,
    ],
  );

  /* ---------- Renderers ---------- */
  const renderHeader = () => (
    <div className="flex flex-col items-center gap-3 border-b border-gray-200 px-5 py-5 text-center dark:border-gray-800">
      <div className="relative">
        <Avatar
          src={conversation?.avatarUrl}
          name={conversation?.name || 'Group'}
          size="xl"
        />
        {isCurrentUserAdmin ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_MIME_TYPES.join(',')}
              onChange={handleAvatarPick}
              className="hidden"
              disabled={isUploadingAvatar}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              aria-label="Change group photo"
              className="absolute -right-1 -bottom-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {isUploadingAvatar ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </>
        ) : null}
      </div>

      {isEditingName ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSaveName();
          }}
          className="flex w-full max-w-xs items-center gap-2"
        >
          <input
            type="text"
            value={draftName}
            maxLength={GROUP_RULES.NAME_MAX_LENGTH}
            onChange={(event) => setDraftName(event.target.value)}
            autoFocus
            disabled={isSavingName}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Group name"
            aria-label="Group name"
          />
          <button
            type="submit"
            disabled={isSavingName}
            aria-label="Save name"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            {isSavingName ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={handleCancelRename}
            disabled={isSavingName}
            aria-label="Cancel rename"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h3 className="max-w-xs truncate text-base font-semibold text-gray-900 dark:text-white">
            {conversation?.name || 'Untitled group'}
          </h3>
          {isCurrentUserAdmin ? (
            <button
              type="button"
              onClick={handleStartRename}
              aria-label="Rename group"
              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {(conversation?.participants?.length ?? 0)}{' '}
        {(conversation?.participants?.length ?? 0) === 1 ? 'member' : 'members'}
        {isCurrentUserAdmin ? ' · You are an admin' : ''}
      </p>
    </div>
  );

  const renderTabs = () => (
    <div
      role="tablist"
      aria-label="Group settings sections"
      className="flex items-center gap-1 border-b border-gray-200 px-3 py-2 dark:border-gray-800"
    >
      {TABS.filter((tab) => !tab.adminOnly || isCurrentUserAdmin).map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderMemberRow = (member) => {
    const memberId = idOf(member);
    const isAdminMember = adminIds.has(memberId);
    const isSelf = memberId === currentUserId;
    const isBusy = busyMemberId === memberId;
    // Server already nulls `isOnline` for members who hide presence;
    // re-checking the boolean shields us from any stale cached payload.
    const showsPresence = member?.isOnline !== undefined;
    const isOnline = showsPresence && onlineUserIds.has(memberId);

    return (
      <li
        key={memberId}
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
      >
        <span className="relative shrink-0">
          <Avatar
            src={member.avatarUrl}
            name={member.displayName || member.username}
            size="md"
          />
          {showsPresence ? (
            <span className="absolute right-0 bottom-0">
              <PresenceDot online={isOnline} size="sm" />
            </span>
          ) : null}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {member.displayName || member.username}
              {isSelf ? ' (you)' : ''}
            </span>
            {isAdminMember ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                <Shield className="h-2.5 w-2.5" aria-hidden="true" />
                Admin
              </span>
            ) : null}
          </span>
          {member.username ? (
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">
              @{member.username}
            </span>
          ) : null}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {isBusy ? (
            <Loader2
              className="h-4 w-4 animate-spin text-gray-400"
              aria-label="Updating member"
            />
          ) : null}

          {isCurrentUserAdmin && !isSelf ? (
            <>
              {isAdminMember ? (
                <button
                  type="button"
                  onClick={() => handlePromoteOrDemote(memberId, false)}
                  disabled={Boolean(busyMemberId)}
                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                  title="Demote admin"
                  aria-label={`Demote ${member.displayName || member.username}`}
                >
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handlePromoteOrDemote(memberId, true)}
                  disabled={Boolean(busyMemberId)}
                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                  title="Promote to admin"
                  aria-label={`Promote ${member.displayName || member.username}`}
                >
                  <Shield className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  handleRemoveMember(memberId, member.displayName || member.username)
                }
                disabled={Boolean(busyMemberId)}
                className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                title="Remove from group"
                aria-label={`Remove ${member.displayName || member.username}`}
              >
                <UserMinus className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : null}

          {isSelf ? (
            <button
              type="button"
              onClick={() => handleLeaveOrDelete({ asDelete: false })}
              disabled={isLeaving}
              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Leave
            </button>
          ) : null}
        </div>
      </li>
    );
  };

  const renderMembersTab = () => {
    const members = conversation?.participants ?? [];
    if (members.length === 0) {
      return (
        <p className="px-5 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
          No members to show.
        </p>
      );
    }
    // Admins float to the top so the role hierarchy is visually obvious;
    // among admins, current user first; otherwise insertion order.
    const sorted = [...members].sort((a, b) => {
      const aAdmin = adminIds.has(idOf(a));
      const bAdmin = adminIds.has(idOf(b));
      if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;
      const aSelf = idOf(a) === currentUserId;
      const bSelf = idOf(b) === currentUserId;
      if (aSelf !== bSelf) return aSelf ? -1 : 1;
      return 0;
    });
    return <ul className="space-y-0.5 px-3 py-2">{sorted.map(renderMemberRow)}</ul>;
  };

  const renderAddTab = () => (
    <div className="flex h-full flex-col">
      {pendingAdds.length > 0 ? (
        <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              To add ({pendingAdds.length})
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {pendingAdds.map((member) => {
              const memberId = idOf(member);
              return (
                <li key={memberId}>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-0.5 pr-1 pl-1 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                    <Avatar
                      src={member.avatarUrl}
                      name={member.displayName || member.username}
                      size="xs"
                    />
                    <span className="max-w-40 truncate">
                      {member.displayName || member.username}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePendingAdd(member)}
                      aria-label={`Remove ${member.displayName || member.username}`}
                      className="rounded-full p-0.5 text-brand-700/70 transition-colors hover:bg-brand-100 hover:text-brand-900 dark:text-brand-200/70 dark:hover:bg-brand-800/60 dark:hover:text-white"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <UserSearchInput
        mode="multi"
        autoFocus
        selectedIds={pendingAdds.map(idOf)}
        // Existing members are excluded from results so the row never
        // appears as a duplicate. The server would 4xx anyway, but
        // hiding them avoids the "why can't I select Bob?" confusion.
        excludeIds={participantIds}
        onToggle={togglePendingAdd}
        placeholder="Search people to add…"
        emptyHint="They might already be in this group."
      />

      <div className="border-t border-gray-200 px-5 py-3 dark:border-gray-800">
        <button
          type="button"
          onClick={handleSubmitAdds}
          disabled={isAddingMembers || pendingAdds.length === 0}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          {isAddingMembers ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Adding…
            </>
          ) : (
            <>
              Add{' '}
              {pendingAdds.length > 0
                ? `${pendingAdds.length} ${pendingAdds.length === 1 ? 'member' : 'members'}`
                : 'members'}
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="flex flex-col gap-3 px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {isMuted ? (
            <BellOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Bell className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Mute this group
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Suppresses sound, browser notifications and the unread badge for new
            messages here. The conversation still updates in the sidebar.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isMuted}
          onClick={handleToggleMute}
          disabled={isMuting}
          className={clsx(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
            isMuted
              ? 'bg-brand-600 dark:bg-brand-500'
              : 'bg-gray-300 dark:bg-gray-600',
          )}
          aria-label={isMuted ? 'Unmute conversation' : 'Mute conversation'}
        >
          <span
            className={clsx(
              'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
              isMuted ? 'translate-x-4' : 'translate-x-0.5',
            )}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );

  const renderDangerTab = () => (
    <div className="flex flex-col gap-3 px-5 py-5">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          These actions affect your access to the group's history. Past
          messages remain on every member's device.
        </p>
      </div>

      <button
        type="button"
        onClick={() => handleLeaveOrDelete({ asDelete: false })}
        disabled={isLeaving}
        className="inline-flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-60 dark:border-gray-700 dark:hover:border-red-900 dark:hover:bg-red-950/30"
      >
        <span className="flex flex-col">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Leave group
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            You'll stop receiving new messages from this conversation.
          </span>
        </span>
        <LogOut className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
      </button>

      {isSoleAdmin ? (
        <button
          type="button"
          onClick={() => handleLeaveOrDelete({ asDelete: true })}
          disabled={isLeaving}
          className="inline-flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/60 px-4 py-3 text-left transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/30 dark:hover:bg-red-950/60"
        >
          <span className="flex flex-col">
            <span className="text-sm font-medium text-red-700 dark:text-red-200">
              Delete group
            </span>
            <span className="text-xs text-red-600/80 dark:text-red-300/80">
              You're the sole admin. Leaving will close the group for everyone.
            </span>
          </span>
          <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-300" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  const renderBody = () => {
    if (!isGroup) {
      return (
        <p className="px-5 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
          Settings are only available for group conversations.
        </p>
      );
    }

    switch (activeTab) {
      case 'add':
        return isCurrentUserAdmin ? renderAddTab() : renderMembersTab();
      case 'notifications':
        return renderNotificationsTab();
      case 'danger':
        return renderDangerTab();
      case 'members':
      default:
        return renderMembersTab();
    }
  };

  return (
    <Modal
      open={open && Boolean(conversation)}
      onClose={onClose}
      title="Group settings"
      description="Manage members, notifications and group details."
      size="md"
      panelClassName="h-[40rem]"
      closeOnBackdrop={!isLeaving && !isAddingMembers && !isSavingName && !isUploadingAvatar}
      closeOnEscape={!isLeaving && !isAddingMembers && !isSavingName && !isUploadingAvatar}
    >
      <div className="flex h-full flex-col">
        {renderHeader()}
        {renderTabs()}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {renderBody()}
        </div>
      </div>
    </Modal>
  );
};

export default GroupSettingsModal;
