import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import Avatar from '../../components/common/Avatar.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { updateProfile } from '../../api/auth.service.js';
import { uploadAvatar } from '../../api/upload.service.js';
import { AUTH_RULES, PROFILE_RULES } from '../../utils/constants.js';

/**
 * ProfileSettings — display name, bio and avatar.
 *
 * Mirroring the server contract (`PATCH /api/auth/profile` accepts
 * `displayName`, `bio`, `avatarUrl`, `avatarPublicId`) we ONLY send
 * fields the user has actually changed. That keeps the payload minimal
 * and avoids accidentally overwriting an avatar that was changed in
 * another tab while the user was editing their bio.
 *
 * Avatar upload is independent from the Save button:
 *   - Uploading writes to the user document immediately (the upload
 *     endpoint persists `avatarUrl`/`avatarPublicId` itself), so the
 *     navbar avatar updates the moment the upload resolves.
 *   - The local preview is set from a `URL.createObjectURL` blob while
 *     the upload is in flight so the user sees instant feedback.
 *
 * SECURITY: client-side type/size checks are UX-only — the server is
 * the authority (Multer whitelists JPEG/PNG/WEBP up to MAX_UPLOAD_SIZE_MB).
 */

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ProfileSettings = () => {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Reset the local form whenever the upstream user changes (e.g. a
   * different account signs in on the same tab, or AuthContext refresh
   * pulls a server-side update). */
  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
    setBio(user?.bio ?? '');
  }, [user?.displayName, user?.bio]);

  /* Revoke blob URLs on unmount / replacement to avoid leaks. */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!user) return null;

  const trimmedDisplayName = displayName.trim();
  const trimmedBio = bio.trim();
  const isDirty =
    trimmedDisplayName !== (user.displayName ?? '') ||
    trimmedBio !== (user.bio ?? '');

  const displayNameError =
    trimmedDisplayName.length < AUTH_RULES.DISPLAY_NAME_MIN_LENGTH
      ? `Display name must be at least ${AUTH_RULES.DISPLAY_NAME_MIN_LENGTH} characters.`
      : trimmedDisplayName.length > AUTH_RULES.DISPLAY_NAME_MAX_LENGTH
        ? `Display name must be at most ${AUTH_RULES.DISPLAY_NAME_MAX_LENGTH} characters.`
        : null;

  const handleAvatarPick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file twice
    if (!file) return;

    if (!ALLOWED_MIME.has(file.type)) {
      toast.error('Please choose a JPEG, PNG or WEBP image.');
      return;
    }
    if (file.size > PROFILE_RULES.AVATAR_MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${PROFILE_RULES.AVATAR_MAX_SIZE_MB} MB.`);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setAvatarUploading(true);

    try {
      const result = await uploadAvatar(file);
      const url = result?.data?.url;
      const publicId = result?.data?.publicId;
      if (url) {
        updateUser({ avatarUrl: url, avatarPublicId: publicId ?? null });
        toast.success('Avatar updated.');
      }
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Avatar upload failed.';
      toast.error(message);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving || !isDirty || displayNameError) return;

    const payload = {};
    if (trimmedDisplayName !== (user.displayName ?? '')) {
      payload.displayName = trimmedDisplayName;
    }
    if (trimmedBio !== (user.bio ?? '')) {
      payload.bio = trimmedBio;
    }
    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    try {
      const result = await updateProfile(payload);
      const nextUser = result?.data?.user;
      if (nextUser) {
        updateUser(nextUser);
      } else {
        updateUser(payload);
      }
      toast.success('Profile saved.');
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Could not save profile.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = previewUrl ?? user.avatarUrl;

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <header>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Profile
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This is how others will see you across the app.
        </p>
      </header>

      {/* Avatar */}
      <section className="flex items-center gap-4">
        <div className="relative">
          <Avatar
            src={avatarSrc}
            name={user.displayName || user.username}
            size="xl"
          />
          {avatarUploading ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={handleAvatarPick}
            disabled={avatarUploading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            <span>{avatarUploading ? 'Uploading…' : 'Change avatar'}</span>
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            JPEG, PNG or WEBP. Max {PROFILE_RULES.AVATAR_MAX_SIZE_MB} MB.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
      </section>

      {/* Read-only identity */}
      <section className="grid gap-4 sm:grid-cols-2">
        <ReadOnlyField label="Username" value={`@${user.username}`} />
        <ReadOnlyField label="Email" value={user.email ?? ''} />
      </section>

      {/* Editable */}
      <section className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
            Display name
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(event) =>
              setDisplayName(
                event.target.value.slice(0, AUTH_RULES.DISPLAY_NAME_MAX_LENGTH),
              )
            }
            minLength={AUTH_RULES.DISPLAY_NAME_MIN_LENGTH}
            maxLength={AUTH_RULES.DISPLAY_NAME_MAX_LENGTH}
            className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            required
          />
          {displayNameError ? (
            <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
              {displayNameError}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
            Bio
          </span>
          <textarea
            value={bio}
            onChange={(event) =>
              setBio(event.target.value.slice(0, PROFILE_RULES.BIO_MAX_LENGTH))
            }
            maxLength={PROFILE_RULES.BIO_MAX_LENGTH}
            rows={4}
            placeholder="Tell people a little about yourself…"
            className="block w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <span className="mt-1 block text-right text-[11px] text-gray-400">
            {bio.length}/{PROFILE_RULES.BIO_MAX_LENGTH}
          </span>
        </label>
      </section>

      <footer className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
        <button
          type="submit"
          disabled={saving || !isDirty || Boolean(displayNameError)}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Spinner size="sm" /> : null}
          <span>Save changes</span>
        </button>
      </footer>
    </form>
  );
};

const ReadOnlyField = ({ label, value }) => (
  <div>
    <span className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
      {label}
    </span>
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-300">
      {value || <span className="italic text-gray-400">Not set</span>}
    </div>
  </div>
);

export default ProfileSettings;
