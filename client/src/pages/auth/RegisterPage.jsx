import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AtSign,
  Check,
  Eye,
  EyeOff,
  Mail,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import { AUTH_RULES, ROUTES } from '../../utils/constants.js';

/**
 * RegisterPage — sign-up form.
 *
 * Field semantics mirror the server-side validators in
 * `server/validators/auth.validator.js`. Client checks here are UX
 * sugar only — the server is the authority and will reject a payload
 * that slipped past us.
 *
 * Username "availability" hint:
 *   The public API does NOT expose a username-existence endpoint on
 *   purpose (account enumeration risk + rate-limiting complexity for
 *   guests). The hint we render is therefore a FORMAT check only —
 *   "looks valid" rather than "is free". An actually-taken username
 *   surfaces as a 409 conflict on submit, with the SAME generic copy
 *   we use for email collisions.
 *
 * Password strength meter:
 *   Three-step indicator (length → letters+numbers → "strong" length
 *   bonus) intended to nudge users toward better passwords without
 *   blocking submission as long as the server's minimum is met.
 *
 * SECURITY:
 *   - Password input stays type="password" by default; toggling to
 *     plaintext requires an explicit user gesture.
 *   - Neither password nor confirmation is logged, persisted, or
 *     emitted outside this component's local state.
 */

const GENERIC_CONFLICT_ERROR =
  'That email or username is unavailable. Please try a different one.';

const usernameFormatHint = (value) => {
  if (!value) return null;
  if (value.length < AUTH_RULES.USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      message: `At least ${AUTH_RULES.USERNAME_MIN_LENGTH} characters`,
    };
  }
  if (value.length > AUTH_RULES.USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `At most ${AUTH_RULES.USERNAME_MAX_LENGTH} characters`,
    };
  }
  if (!AUTH_RULES.USERNAME_REGEX.test(value)) {
    return { ok: false, message: 'Letters, numbers, and underscores only' };
  }
  return { ok: true, message: 'Looks good' };
};

const measurePassword = (value) => {
  if (!value) return { score: 0, label: '', percent: 0 };
  let score = 0;
  if (value.length >= AUTH_RULES.PASSWORD_MIN_LENGTH) score += 1;
  if (AUTH_RULES.PASSWORD_COMPLEXITY.test(value)) score += 1;
  if (value.length >= 12) score += 1;

  const labels = ['Too weak', 'Weak', 'Good', 'Strong'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
  return {
    score,
    label: labels[score],
    color: colors[score],
    percent: (score / 3) * 100,
  };
};

const RegisterPage = () => {
  const { register } = useAuth();
  const location = useLocation();

  const usernameId = useId();
  const displayNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const formErrorId = useId();
  const usernameHintId = useId();
  const strengthId = useId();

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');

  const debouncedUsername = useDebounce(form.username, 250);
  const usernameHint = useMemo(
    () => usernameFormatHint(debouncedUsername.trim()),
    [debouncedUsername],
  );

  const strength = useMemo(() => measurePassword(form.password), [form.password]);

  const passwordsMatch =
    form.confirmPassword.length === 0 || form.password === form.confirmPassword;

  // Wipe the global form error as soon as the user starts editing
  // anything — keeping a stale red banner above a freshly-typed field
  // feels broken.
  useEffect(() => {
    if (formError) setFormError('');
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const { [key]: _ignored, ...rest } = prev;
        return rest;
      });
    }
  };

  const validateClient = () => {
    const next = {};
    const username = form.username.trim();
    const displayName = form.displayName.trim();
    const email = form.email.trim();

    if (!username) {
      next.username = 'Username is required';
    } else {
      const hint = usernameFormatHint(username);
      if (hint && !hint.ok) next.username = hint.message;
    }

    if (!displayName) {
      next.displayName = 'Display name is required';
    } else if (displayName.length < AUTH_RULES.DISPLAY_NAME_MIN_LENGTH) {
      next.displayName = `At least ${AUTH_RULES.DISPLAY_NAME_MIN_LENGTH} characters`;
    } else if (displayName.length > AUTH_RULES.DISPLAY_NAME_MAX_LENGTH) {
      next.displayName = `At most ${AUTH_RULES.DISPLAY_NAME_MAX_LENGTH} characters`;
    }

    if (!email) {
      next.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'Enter a valid email address';
    }

    if (!form.password) {
      next.password = 'Password is required';
    } else if (form.password.length < AUTH_RULES.PASSWORD_MIN_LENGTH) {
      next.password = `At least ${AUTH_RULES.PASSWORD_MIN_LENGTH} characters`;
    } else if (!AUTH_RULES.PASSWORD_COMPLEXITY.test(form.password)) {
      next.password = 'Must contain at least one letter and one number';
    }

    if (!form.confirmPassword) {
      next.confirmPassword = 'Please confirm your password';
    } else if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }

    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length) {
      setFieldErrors(clientErrors);
      setFormError('');
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError('');
    try {
      await register({
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      toast.success(`Welcome, ${form.displayName.trim()}!`);
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;

      let nextFormError = '';
      if (status === 400 && Array.isArray(data?.errors)) {
        const next = {};
        for (const item of data.errors) {
          if (item?.field && item?.message) next[item.field] = item.message;
        }
        setFieldErrors(next);
        nextFormError = data.message || 'Please fix the highlighted fields';
      } else if (status === 409) {
        // Generic copy by design — never reveal which of email/username
        // is taken (account enumeration).
        nextFormError = GENERIC_CONFLICT_ERROR;
      } else if (status === 429) {
        nextFormError = 'Too many attempts. Please try again in a moment.';
      } else {
        nextFormError = data?.message || 'Something went wrong. Please try again.';
      }
      setFormError(nextFormError);
      toast.error(nextFormError, { id: 'register-error' });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (fieldKey, extra = '') =>
    [
      'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm',
      'placeholder:text-gray-400 transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
      'dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500',
      fieldErrors[fieldKey]
        ? 'border-red-400 dark:border-red-500'
        : 'border-gray-300 dark:border-gray-700',
      extra,
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Join the conversation in seconds
        </p>
      </header>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-describedby={formError ? formErrorId : undefined}
        className="space-y-4"
      >
        {formError ? (
          <div
            id={formErrorId}
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {formError}
          </div>
        ) : null}

        {/* Username */}
        <div className="space-y-1.5">
          <label
            htmlFor={usernameId}
            className="block text-sm font-medium text-gray-800 dark:text-gray-200"
          >
            Username
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <AtSign className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              id={usernameId}
              type="text"
              name="username"
              value={form.username}
              onChange={setField('username')}
              autoComplete="username"
              autoFocus
              required
              disabled={submitting}
              minLength={AUTH_RULES.USERNAME_MIN_LENGTH}
              maxLength={AUTH_RULES.USERNAME_MAX_LENGTH}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={
                fieldErrors.username
                  ? `${usernameId}-err`
                  : usernameHint
                    ? usernameHintId
                    : undefined
              }
              placeholder="alice_42"
              className={inputClass('username', 'pl-9')}
            />
            {usernameHint && !fieldErrors.username ? (
              <span
                className={`pointer-events-none absolute inset-y-0 right-3 flex items-center ${
                  usernameHint.ok
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
                aria-hidden="true"
              >
                {usernameHint.ok ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </span>
            ) : null}
          </div>
          {fieldErrors.username ? (
            <p id={`${usernameId}-err`} className="text-xs text-red-600 dark:text-red-400">
              {fieldErrors.username}
            </p>
          ) : usernameHint ? (
            <p
              id={usernameHintId}
              className={`text-xs ${
                usernameHint.ok
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {usernameHint.message}
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Letters, numbers, and underscores. {AUTH_RULES.USERNAME_MIN_LENGTH}–
              {AUTH_RULES.USERNAME_MAX_LENGTH} characters.
            </p>
          )}
        </div>

        {/* Display name */}
        <div className="space-y-1.5">
          <label
            htmlFor={displayNameId}
            className="block text-sm font-medium text-gray-800 dark:text-gray-200"
          >
            Display name
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <User className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              id={displayNameId}
              type="text"
              name="displayName"
              value={form.displayName}
              onChange={setField('displayName')}
              autoComplete="name"
              required
              disabled={submitting}
              minLength={AUTH_RULES.DISPLAY_NAME_MIN_LENGTH}
              maxLength={AUTH_RULES.DISPLAY_NAME_MAX_LENGTH}
              aria-invalid={Boolean(fieldErrors.displayName)}
              aria-describedby={
                fieldErrors.displayName ? `${displayNameId}-err` : undefined
              }
              placeholder="Alice Wonderland"
              className={inputClass('displayName', 'pl-9')}
            />
          </div>
          {fieldErrors.displayName ? (
            <p
              id={`${displayNameId}-err`}
              className="text-xs text-red-600 dark:text-red-400"
            >
              {fieldErrors.displayName}
            </p>
          ) : null}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label
            htmlFor={emailId}
            className="block text-sm font-medium text-gray-800 dark:text-gray-200"
          >
            Email
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <Mail className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              id={emailId}
              type="email"
              name="email"
              value={form.email}
              onChange={setField('email')}
              autoComplete="email"
              required
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? `${emailId}-err` : undefined}
              placeholder="you@example.com"
              className={inputClass('email', 'pl-9')}
            />
          </div>
          {fieldErrors.email ? (
            <p id={`${emailId}-err`} className="text-xs text-red-600 dark:text-red-400">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        {/* Password + strength meter */}
        <div className="space-y-1.5">
          <label
            htmlFor={passwordId}
            className="block text-sm font-medium text-gray-800 dark:text-gray-200"
          >
            Password
          </label>
          <div className="relative">
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={setField('password')}
              autoComplete="new-password"
              required
              disabled={submitting}
              minLength={AUTH_RULES.PASSWORD_MIN_LENGTH}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={[
                fieldErrors.password ? `${passwordId}-err` : null,
                form.password ? strengthId : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined}
              placeholder="At least 8 characters"
              className={inputClass('password', 'pr-10')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-2 flex items-center rounded-md px-1.5 text-gray-500 transition-colors hover:text-gray-800 focus-visible:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {form.password ? (
            <div id={strengthId} aria-live="polite">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={strength.score}
                aria-label="Password strength"
              >
                <div
                  className={`h-full transition-all ${strength.color}`}
                  style={{ width: `${strength.percent}%` }}
                />
              </div>
              <p className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Strength: {strength.label}</span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      form.password.length >= AUTH_RULES.PASSWORD_MIN_LENGTH
                        ? 'text-green-600 dark:text-green-400'
                        : ''
                    }
                  >
                    {AUTH_RULES.PASSWORD_MIN_LENGTH}+ chars
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      AUTH_RULES.PASSWORD_COMPLEXITY.test(form.password)
                        ? 'text-green-600 dark:text-green-400'
                        : ''
                    }
                  >
                    letter + number
                  </span>
                </span>
              </p>
            </div>
          ) : null}

          {fieldErrors.password ? (
            <p id={`${passwordId}-err`} className="text-xs text-red-600 dark:text-red-400">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label
            htmlFor={confirmId}
            className="block text-sm font-medium text-gray-800 dark:text-gray-200"
          >
            Confirm password
          </label>
          <input
            id={confirmId}
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={setField('confirmPassword')}
            autoComplete="new-password"
            required
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.confirmPassword) || !passwordsMatch}
            aria-describedby={
              fieldErrors.confirmPassword || !passwordsMatch
                ? `${confirmId}-err`
                : undefined
            }
            placeholder="Re-enter your password"
            className={inputClass(
              'confirmPassword',
              !passwordsMatch && !fieldErrors.confirmPassword
                ? 'border-red-400 dark:border-red-500'
                : '',
            )}
          />
          {fieldErrors.confirmPassword ? (
            <p id={`${confirmId}-err`} className="text-xs text-red-600 dark:text-red-400">
              {fieldErrors.confirmPassword}
            </p>
          ) : !passwordsMatch ? (
            <p id={`${confirmId}-err`} className="text-xs text-red-600 dark:text-red-400">
              Passwords do not match
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? (
            <>
              <Spinner
                size="sm"
                label="Creating account"
                className="border-white/30! border-t-white!"
              />
              <span>Creating account…</span>
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              <span>Create account</span>
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        Already have an account?{' '}
        <Link
          to={ROUTES.LOGIN}
          state={location.state}
          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default RegisterPage;
