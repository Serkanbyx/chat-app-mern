import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import toast from 'react-hot-toast';

import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { ROUTES } from '../../utils/constants.js';

/**
 * LoginPage — sign-in form for returning users.
 *
 * Why not use a form library?
 *   The flow is small (2 fields), state lives entirely in this
 *   component, and we'd have to wire its error model to our own
 *   `{ field, message }[]` shape anyway. Bare React + a `fieldErrors`
 *   map keeps the bundle smaller and the data flow trivial to audit.
 *
 * Error model:
 *   - `fieldErrors` mirrors the server's `{ field, message }[]` shape
 *     and is also where client-side checks land — both render through
 *     the same JSX so users can't tell where the validation came from.
 *   - `formError` is the top-of-form generic message used for 401s and
 *     network failures (anything that isn't tied to a specific input).
 *
 * SECURITY:
 *   On a 401 we ALWAYS show the same generic message regardless of
 *   whether the email exists. Confirming an email's existence here
 *   would let attackers enumerate accounts.
 */

const GENERIC_AUTH_ERROR = 'Invalid email or password';

const LoginPage = () => {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const emailId = useId();
  const passwordId = useId();
  const formErrorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');

  const redirectHint = useMemo(() => {
    // ProtectedRoute stashes the original requested URL as a string in
    // `state.from` so we can deep-link the user back to it after a
    // successful sign-in.
    const from = location.state?.from;
    if (!from || typeof from !== 'string') return null;
    if (from.startsWith(ROUTES.LOGIN) || from.startsWith(ROUTES.REGISTER)) return null;
    return from;
  }, [location.state]);

  // Clear any lingering error toasts when the user starts editing —
  // stale red text alongside fresh input feels broken.
  useEffect(() => {
    if (formError) setFormError('');
  }, [email, password]); // eslint-disable-line react-hooks/exhaustive-deps

  const validateClient = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required';
    if (!password) next.password = 'Password is required';
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
      await login(email.trim(), password);
      toast.success('Welcome back!');
      // AuthContext.applyAuthResult navigates to /chat by default; if
      // the user originally requested a different protected page, push
      // them there instead. `replace` keeps the login page out of
      // history so Back doesn't return to a now-redundant form.
      if (redirectHint) {
        navigate(redirectHint, { replace: true });
      }
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;

      let nextFormError = '';
      if (status === 400 && Array.isArray(data?.errors)) {
        // Field-level validation errors from express-validator.
        const next = {};
        for (const item of data.errors) {
          if (item?.field && item?.message) next[item.field] = item.message;
        }
        setFieldErrors(next);
        nextFormError = data.message || 'Please fix the highlighted fields';
      } else if (status === 401) {
        nextFormError = GENERIC_AUTH_ERROR;
      } else if (status === 403) {
        nextFormError = data?.message || 'Account is not allowed to sign in';
      } else if (status === 429) {
        nextFormError = 'Too many attempts. Please try again in a moment.';
      } else {
        nextFormError = data?.message || 'Something went wrong. Please try again.';
      }
      setFormError(nextFormError);
      toast.error(nextFormError, { id: 'login-error' });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (fieldKey) =>
    [
      'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm',
      'placeholder:text-gray-400 transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
      'dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500',
      fieldErrors[fieldKey]
        ? 'border-red-400 dark:border-red-500'
        : 'border-gray-300 dark:border-gray-700',
    ].join(' ');

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Sign in to continue your conversations
        </p>
        {redirectHint ? (
          <p className="mt-2 text-xs text-brand-600 dark:text-brand-300">
            You'll be returned to <code className="font-mono">{redirectHint}</code>
          </p>
        ) : null}
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? `${emailId}-err` : undefined}
              placeholder="you@example.com"
              className={`${inputClass('email')} pl-9`}
            />
          </div>
          {fieldErrors.email ? (
            <p id={`${emailId}-err`} className="text-xs text-red-600 dark:text-red-400">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

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
              // SECURITY: the input stays type="password" by default;
              // toggling to "text" only happens via an explicit user
              // gesture below. Browsers won't autofill or save form
              // data from a hidden text field.
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? `${passwordId}-err` : undefined}
              placeholder="••••••••"
              className={`${inputClass('password')} pr-10`}
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
          {fieldErrors.password ? (
            <p id={`${passwordId}-err`} className="text-xs text-red-600 dark:text-red-400">
              {fieldErrors.password}
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
              <Spinner size="sm" label="Signing in" className="border-white/30! border-t-white!" />
              <span>Signing in…</span>
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Sign in</span>
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        New here?{' '}
        <Link
          to={ROUTES.REGISTER}
          state={location.state}
          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
};

export default LoginPage;
