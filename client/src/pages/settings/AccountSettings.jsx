import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmModal from '../../components/common/ConfirmModal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { changePassword, deleteAccount } from '../../api/auth.service.js';
import { AUTH_RULES } from '../../utils/constants.js';

/**
 * AccountSettings — password change + hard-delete.
 *
 * The two flows live here because they share a re-auth gate (current
 * password) and an "irreversible action" tone. Splitting them across
 * two routes would force users to learn two paths for one mental
 * concept ("account & security").
 *
 * Delete account flow (defence in depth):
 *   1. The user must type their *exact* username.
 *   2. They must enter their *current* password.
 *   3. They confirm one more time in a `ConfirmModal`.
 *   The server enforces (2) again on the wire (`deleteAccount`
 *   validator + bcrypt compare) — the client checks are UX-only.
 */

const PASSWORD_MIN = AUTH_RULES.PASSWORD_MIN_LENGTH;
const PASSWORD_REGEX = AUTH_RULES.PASSWORD_COMPLEXITY;

const validateNewPassword = (value, current) => {
  if (!value) return 'New password is required.';
  if (value.length < PASSWORD_MIN) {
    return `New password must be at least ${PASSWORD_MIN} characters.`;
  }
  if (!PASSWORD_REGEX.test(value)) {
    return 'New password must contain at least one letter and one number.';
  }
  if (value === current) {
    return 'New password must be different from your current password.';
  }
  return null;
};

const AccountSettings = () => {
  const { user, logout } = useAuth();

  /* ---------- Password change ---------- */
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [pwError, setPwError] = useState(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const updatePwField = (key) => (event) =>
    setPwForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (pwSubmitting) return;
    setPwError(null);

    if (!pwForm.currentPassword) {
      setPwError('Please enter your current password.');
      return;
    }
    const validation = validateNewPassword(
      pwForm.newPassword,
      pwForm.currentPassword,
    );
    if (validation) {
      setPwError(validation);
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmNewPassword) {
      setPwError('New passwords do not match.');
      return;
    }

    setPwSubmitting(true);
    try {
      await changePassword({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success('Password updated.');
      setPwForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Could not change password.';
      setPwError(message);
    } finally {
      setPwSubmitting(false);
    }
  };

  /* ---------- Delete account ---------- */
  const [deleteForm, setDeleteForm] = useState({
    usernameConfirm: '',
    password: '',
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const usernameMatches =
    user?.username && deleteForm.usernameConfirm === user.username;
  const canRequestDelete = usernameMatches && deleteForm.password.length > 0;

  const handleDeleteRequest = (event) => {
    event.preventDefault();
    setDeleteError(null);
    if (!canRequestDelete) {
      setDeleteError(
        'Type your exact username and enter your password to continue.',
      );
      return;
    }
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteAccount({ password: deleteForm.password });
      toast.success('Your account has been deleted.');
      setDeleteModalOpen(false);
      logout();
    } catch (err) {
      const message =
        err?.response?.data?.message || 'Account deletion failed.';
      toast.error(message);
      throw err; /* re-throw so ConfirmModal stays open for retry */
    }
  };

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Account
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your password and your account itself.
        </p>
      </header>

      {/* ---------- Password ---------- */}
      <section
        aria-labelledby="password-heading"
        className="rounded-xl border border-gray-200 p-5 dark:border-gray-800"
      >
        <div className="mb-4 flex items-start gap-2">
          <KeyRound
            className="mt-0.5 h-4 w-4 text-gray-400"
            aria-hidden="true"
          />
          <div>
            <h3
              id="password-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Change password
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Use at least {PASSWORD_MIN} characters with a letter and a number.
            </p>
          </div>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <PasswordField
            label="Current password"
            value={pwForm.currentPassword}
            onChange={updatePwField('currentPassword')}
            visible={showPasswords}
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            value={pwForm.newPassword}
            onChange={updatePwField('newPassword')}
            visible={showPasswords}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new password"
            value={pwForm.confirmNewPassword}
            onChange={updatePwField('confirmNewPassword')}
            visible={showPasswords}
            autoComplete="new-password"
          />

          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {showPasswords ? (
              <>
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Hide passwords</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Show passwords</span>
              </>
            )}
          </button>

          {pwError ? (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300"
            >
              {pwError}
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={pwSubmitting}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pwSubmitting ? <Spinner size="sm" /> : null}
              <span>Update password</span>
            </button>
          </div>
        </form>
      </section>

      {/* ---------- Delete account ---------- */}
      <section
        aria-labelledby="delete-heading"
        className="rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900/60 dark:bg-red-950/20"
      >
        <div className="mb-4 flex items-start gap-2">
          <Trash2
            className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
          <div>
            <h3
              id="delete-heading"
              className="text-sm font-semibold text-red-700 dark:text-red-300"
            >
              Delete account
            </h3>
            <p className="text-xs text-red-700/80 dark:text-red-300/80">
              This will permanently anonymise your profile and remove you
              from all conversations. This action cannot be undone.
            </p>
          </div>
        </div>

        <form onSubmit={handleDeleteRequest} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-900 dark:text-white">
              Type your username (<span className="font-mono">{user?.username}</span>)
              to confirm
            </span>
            <input
              type="text"
              value={deleteForm.usernameConfirm}
              onChange={(event) =>
                setDeleteForm((prev) => ({
                  ...prev,
                  usernameConfirm: event.target.value,
                }))
              }
              autoComplete="off"
              className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>

          <PasswordField
            label="Password"
            value={deleteForm.password}
            onChange={(event) =>
              setDeleteForm((prev) => ({ ...prev, password: event.target.value }))
            }
            visible={false}
            autoComplete="current-password"
          />

          {deleteError ? (
            <p
              role="alert"
              className="rounded-md bg-red-100 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300"
            >
              {deleteError}
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={!canRequestDelete}
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Delete my account</span>
            </button>
          </div>
        </form>
      </section>

      <ConfirmModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete account?"
        confirmLabel="Yes, delete forever"
        cancelLabel="Keep my account"
      >
        <p>
          You&apos;re about to permanently delete{' '}
          <span className="font-semibold text-gray-900 dark:text-white">
            @{user?.username}
          </span>
          . This will sign you out and cannot be reversed.
        </p>
      </ConfirmModal>
    </div>
  );
};

const PasswordField = ({ label, value, onChange, visible, autoComplete }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-gray-900 dark:text-white">
      {label}
    </span>
    <input
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    />
  </label>
);

export default AccountSettings;
