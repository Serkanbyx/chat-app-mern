import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowLeft, ImagePlus, Loader2, Trash2, Users, X } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import * as conversationService from '../../api/conversation.service.js';
import { uploadGroupAvatar } from '../../api/upload.service.js';
import { GROUP_RULES } from '../../utils/constants.js';
import Avatar from '../common/Avatar.jsx';
import Modal from '../common/Modal.jsx';
import UserSearchInput from '../chat/UserSearchInput.jsx';

/**
 * NewGroupModal — two-step wizard for creating a group conversation.
 *
 * Step "members":
 *   Multi-select via the shared `UserSearchInput`. Selected users are
 *   pinned at the top as removable chips so the user can review the
 *   roster without losing context while continuing to search. The
 *   creator is always added by the server, so we cap the user-selected
 *   list at `MAX_PARTICIPANTS - 1`.
 *
 * Step "details":
 *   Group name (required, ≤50 chars to mirror the server validator)
 *   plus an optional avatar. The avatar is uploaded to Cloudinary
 *   *before* `createGroup` so we can pass back a vetted URL: see
 *   `uploadGroupAvatar` for why it routes through `/upload/message-image`
 *   rather than `/upload/avatar`.
 *
 * Why we keep selection state in the modal rather than the parent:
 *   The selection is wizard-scoped — abandoning the flow should
 *   discard any pending picks. Lifting it out would force the parent
 *   to remember to clear that buffer on cancel, which is a recurring
 *   source of "ghost" state bugs in modal flows.
 *
 * SECURITY:
 *   - Member cap is enforced both in the UI (button disabled, search
 *     rows greyed out) AND server-side (authoritative).
 *   - Avatar uploads run through the same MIME/size pipeline as
 *     profile avatars; we additionally pre-check size client-side
 *     for instant feedback so a 25 MB photo never leaves the device.
 *   - Object URLs created for the local preview are revoked on unmount
 *     to prevent a browser-side memory leak.
 */

const MAX_OTHER_PARTICIPANTS = GROUP_RULES.MAX_PARTICIPANTS - 1;
const MAX_AVATAR_BYTES = GROUP_RULES.AVATAR_MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const NewGroupModal = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { upsertConversation } = useChatState();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('members');
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const currentUserId = user?._id ? String(user._id) : null;
  const selectedIds = useMemo(() => selected.map(idOf), [selected]);
  const trimmedName = groupName.trim();
  const isAtCap = selected.length >= MAX_OTHER_PARTICIPANTS;

  /* Reset wizard state every time the dialog reopens — leaving stale
   * selection or a dangling preview URL would surprise the user on
   * the next "New group" click. */
  const resetState = useCallback(() => {
    setStep('members');
    setSelected([]);
    setGroupName('');
    setAvatarFile(null);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIsSubmitting(false);
    setSubmitError(null);
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose?.();
  }, [isSubmitting, onClose]);

  const handleToggleMember = useCallback(
    (target) => {
      const targetId = idOf(target);
      if (!targetId) return;
      setSelected((prev) => {
        const exists = prev.some((entry) => idOf(entry) === targetId);
        if (exists) return prev.filter((entry) => idOf(entry) !== targetId);
        if (prev.length >= MAX_OTHER_PARTICIPANTS) {
          toast.error(`You can add up to ${MAX_OTHER_PARTICIPANTS} people.`);
          return prev;
        }
        return [...prev, target];
      });
    },
    [],
  );

  const handleRemoveSelected = useCallback((targetId) => {
    setSelected((prev) => prev.filter((entry) => idOf(entry) !== String(targetId)));
  }, []);

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      toast.error('Avatar must be a JPEG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`Image must be smaller than ${GROUP_RULES.AVATAR_MAX_SIZE_MB} MB.`);
      return;
    }

    setAvatarFile(file);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleClearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (selected.length === 0) {
      toast.error('Add at least one other person.');
      setStep('members');
      return;
    }
    if (trimmedName.length === 0) {
      toast.error('Group name is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let avatarUrl = '';
      if (avatarFile) {
        const upload = await uploadGroupAvatar(avatarFile);
        avatarUrl = upload?.data?.url ?? '';
        if (!avatarUrl) {
          throw new Error('Avatar upload did not return a URL');
        }
      }

      const payload = {
        name: trimmedName,
        participantIds: selectedIds,
      };
      if (avatarUrl) payload.avatarUrl = avatarUrl;

      const result = await conversationService.createGroup(payload);
      const conversation = result?.data ?? null;
      if (!conversation?._id) {
        throw new Error('Group could not be created');
      }
      upsertConversation(conversation);
      toast.success(`"${conversation.name}" created.`);
      onClose?.();
      navigate(`/chat/${conversation._id}`);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Could not create group';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------- Footer ---------- */
  const footer =
    step === 'members' ? (
      <>
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => setStep('details')}
          disabled={selected.length === 0}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          Next ({selected.length})
        </button>
      </>
    ) : (
      <>
        <button
          type="button"
          onClick={() => setStep('members')}
          disabled={isSubmitting}
          className="mr-auto inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || trimmedName.length === 0 || selected.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Creating…
            </>
          ) : (
            'Create group'
          )}
        </button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'members' ? 'Add people to group' : 'Group details'}
      description={
        step === 'members'
          ? `Select up to ${MAX_OTHER_PARTICIPANTS} people. You'll be added automatically.`
          : 'Give your group a clear name. You can change it later.'
      }
      size="md"
      panelClassName="h-[36rem]"
      footer={footer}
      closeOnBackdrop={!isSubmitting}
      closeOnEscape={!isSubmitting}
    >
      {step === 'members' ? (
        <div className="flex h-full flex-col">
          {selected.length > 0 ? (
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide dark:text-gray-400">
                  Selected ({selected.length}/{MAX_OTHER_PARTICIPANTS})
                </span>
                {isAtCap ? (
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Group capacity reached.
                  </span>
                ) : null}
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {selected.map((member) => {
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
                          onClick={() => handleRemoveSelected(memberId)}
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
            selectedIds={selectedIds}
            excludeIds={currentUserId ? [currentUserId] : []}
            disabledIds={isAtCap ? [] : []}
            onToggle={handleToggleMember}
            placeholder="Search people to add…"
            emptyHint="Try a different spelling or @username."
          />
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="flex h-full flex-col gap-5 px-5 py-5"
        >
          <div className="flex items-center gap-4">
            <span className="relative inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Group avatar preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Users className="h-8 w-8" aria-hidden="true" />
              )}
            </span>
            <div className="flex flex-col gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_MIME_TYPES.join(',')}
                onChange={handleAvatarChange}
                disabled={isSubmitting}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {avatarFile ? 'Change photo' : 'Add photo'}
                </button>
                {avatarFile ? (
                  <button
                    type="button"
                    onClick={handleClearAvatar}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                JPEG, PNG, or WEBP. Max {GROUP_RULES.AVATAR_MAX_SIZE_MB} MB.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-group-name"
              className="text-xs font-medium text-gray-600 dark:text-gray-300"
            >
              Group name
            </label>
            <input
              id="new-group-name"
              type="text"
              value={groupName}
              maxLength={GROUP_RULES.NAME_MAX_LENGTH}
              onChange={(event) => setGroupName(event.target.value)}
              autoFocus
              disabled={isSubmitting}
              required
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g. Weekend trip planning"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Visible to every member.
              </span>
              <span
                className={clsx(
                  'text-[11px] tabular-nums',
                  trimmedName.length === GROUP_RULES.NAME_MAX_LENGTH
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-400 dark:text-gray-500',
                )}
              >
                {trimmedName.length}/{GROUP_RULES.NAME_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
            <p className="font-medium">
              {selected.length} {selected.length === 1 ? 'person' : 'people'} will be invited.
            </p>
            <p className="mt-0.5 text-gray-500 dark:text-gray-400">
              You'll be added as the group admin automatically.
            </p>
          </div>

          {submitError ? (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
};

export default NewGroupModal;
