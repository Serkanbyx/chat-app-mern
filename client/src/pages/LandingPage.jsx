import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Globe2,
  Lock,
  MessagesSquare,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext.jsx';
import Spinner from '../components/common/Spinner.jsx';
import Footer from '../components/common/Footer.jsx';
import { ROUTES } from '../utils/constants.js';

/**
 * LandingPage — public marketing surface served at `/`.
 *
 * Why a dedicated page (instead of redirecting to /login):
 *   The app needs a presentable entry point for first-time visitors,
 *   social-share previews, and SEO. Guests see this; authenticated
 *   users are forwarded straight into the chat surface so the route
 *   never feels like a detour.
 *
 * Theme:
 *   Pure Tailwind v4 + brand tokens defined in `index.css`. The page
 *   reuses the same `dark:` variants the rest of the app relies on,
 *   so it inherits the user's preferred theme without any extra work.
 *
 * Illustration:
 *   Hand-rolled inline SVG so the asset ships with the bundle (no
 *   extra HTTP request) and reacts to dark mode via `currentColor`.
 */

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-time messaging',
    description:
      'Powered by Socket.io with sub-100ms delivery, typing indicators and read receipts.',
  },
  {
    icon: Users,
    title: 'Group conversations',
    description:
      'Create rooms with up to 100 members, share images and stay in sync across devices.',
  },
  {
    icon: BellRing,
    title: 'Smart notifications',
    description:
      'Browser, sound and in-app alerts you can fine-tune per channel — never miss what matters.',
  },
  {
    icon: Lock,
    title: 'Privacy first',
    description:
      'JWT auth, hashed passwords, rate limiting and granular block controls keep you safe.',
  },
  {
    icon: Globe2,
    title: 'Works anywhere',
    description:
      'Responsive UI tuned for mobile, tablet and desktop with full dark mode support.',
  },
  {
    icon: Sparkles,
    title: 'Built for speed',
    description:
      'React 19, Vite and Tailwind v4 — fast on first paint, faster on every interaction.',
  },
];

const HeroIllustration = () => (
  <svg
    viewBox="0 0 480 360"
    role="img"
    aria-labelledby="heroIllustrationTitle"
    className="h-full w-full"
  >
    <title id="heroIllustrationTitle">
      Illustration of overlapping chat bubbles representing live conversation
    </title>
    <defs>
      <linearGradient id="heroBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.18" />
        <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="bubblePrimary" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--color-brand-500)" />
        <stop offset="100%" stopColor="var(--color-brand-700)" />
      </linearGradient>
    </defs>

    <circle cx="240" cy="180" r="170" fill="url(#heroBg)" />

    <g opacity="0.6">
      <circle cx="80" cy="60" r="3" className="fill-brand-400 dark:fill-brand-300" />
      <circle cx="420" cy="90" r="4" className="fill-brand-300 dark:fill-brand-200" />
      <circle cx="60" cy="280" r="3" className="fill-brand-400 dark:fill-brand-300" />
      <circle cx="430" cy="300" r="2" className="fill-brand-300 dark:fill-brand-200" />
      <circle cx="380" cy="40" r="2" className="fill-brand-200 dark:fill-brand-300" />
    </g>

    <rect
      x="60"
      y="80"
      width="220"
      height="70"
      rx="20"
      className="fill-white stroke-gray-200 dark:fill-gray-800 dark:stroke-gray-700"
      strokeWidth="1.5"
    />
    <circle cx="92" cy="115" r="14" className="fill-brand-100 dark:fill-brand-900" />
    <text
      x="86"
      y="120"
      className="fill-brand-700 dark:fill-brand-200"
      fontSize="14"
      fontWeight="600"
      fontFamily="system-ui, sans-serif"
    >
      A
    </text>
    <rect x="118" y="100" width="140" height="10" rx="5" className="fill-gray-200 dark:fill-gray-700" />
    <rect x="118" y="120" width="100" height="10" rx="5" className="fill-gray-200 dark:fill-gray-700" />

    <rect
      x="200"
      y="170"
      width="220"
      height="70"
      rx="20"
      fill="url(#bubblePrimary)"
    />
    <rect x="220" y="190" width="160" height="10" rx="5" fill="white" opacity="0.85" />
    <rect x="220" y="210" width="120" height="10" rx="5" fill="white" opacity="0.65" />

    <rect
      x="60"
      y="250"
      width="200"
      height="70"
      rx="20"
      className="fill-white stroke-gray-200 dark:fill-gray-800 dark:stroke-gray-700"
      strokeWidth="1.5"
    />
    <circle cx="92" cy="285" r="14" className="fill-amber-100 dark:fill-amber-900/60" />
    <text
      x="87"
      y="290"
      className="fill-amber-700 dark:fill-amber-200"
      fontSize="14"
      fontWeight="600"
      fontFamily="system-ui, sans-serif"
    >
      M
    </text>
    <rect x="118" y="270" width="120" height="10" rx="5" className="fill-gray-200 dark:fill-gray-700" />
    <rect x="118" y="290" width="80" height="10" rx="5" className="fill-gray-200 dark:fill-gray-700" />

    <g transform="translate(360 280)">
      <circle r="22" className="fill-emerald-500" />
      <circle r="22" className="fill-emerald-500" opacity="0.35">
        <animate attributeName="r" values="22;30;22" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="-7" cy="0" r="2.5" fill="white" />
      <circle cx="0" cy="0" r="2.5" fill="white" />
      <circle cx="7" cy="0" r="2.5" fill="white" />
    </g>
  </svg>
);

const LandingPage = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Spinner fullPage size="lg" />;
  }

  if (isAuthenticated) {
    return <Navigate to={ROUTES.CHAT} replace />;
  }

  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur dark:border-gray-800/70 dark:bg-gray-950/80">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
              <MessagesSquare className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>Chatty</span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to={ROUTES.LOGIN}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Link
              to={ROUTES.REGISTER}
              className="hidden rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 sm:inline-flex"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-112 w-240 max-w-full rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-400/10"
          />

          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-800/60 dark:bg-brand-900/30 dark:text-brand-200">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Now with real-time presence
              </span>

              <h1 className="mt-5 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl dark:text-white">
                Conversations that feel{' '}
                <span className="bg-linear-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent dark:from-brand-300 dark:to-brand-500">
                  instant
                </span>
                .
              </h1>

              <p className="mx-auto mt-5 max-w-xl text-base text-gray-600 sm:text-lg lg:mx-0 dark:text-gray-400">
                A modern chat experience built for teams, communities and
                friends. Real-time messaging, group rooms and a polished
                interface — without the bloat.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  to={ROUTES.CHAT}
                  className="group inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md focus-visible:bg-brand-700"
                >
                  <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                  <span>Open Chat</span>
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  to={ROUTES.REGISTER}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  Create an account
                </Link>
              </div>

              <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
                Free forever for personal use • No credit card required
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              <div className="relative aspect-4/3 w-full">
                <HeroIllustration />
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="featuresHeading"
          className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="featuresHeading"
                className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-white"
              >
                Everything you need to stay in touch
              </h2>
              <p className="mt-3 text-base text-gray-600 dark:text-gray-400">
                Thoughtful defaults, fast performance and zero noise. Chatty
                ships with the features you'd expect — and none of the ones
                you wouldn't.
              </p>
            </div>

            <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li
                  key={title}
                  className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-900/40 dark:text-brand-200 dark:group-hover:bg-brand-500 dark:group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-600 to-brand-800 px-6 py-12 text-center shadow-xl sm:px-12 sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
            />

            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to start chatting?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-brand-100">
              Jump straight into the conversation. It only takes a few seconds.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={ROUTES.CHAT}
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
              >
                <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                <span>Open Chat</span>
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
              <Link
                to={ROUTES.LOGIN}
                className="inline-flex items-center justify-center rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-gray-500 sm:flex-row sm:px-6 dark:text-gray-400">
          <p className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-white">
              <MessagesSquare className="h-3 w-3" aria-hidden="true" />
            </span>
            <span>© {year} Chatty. All rights reserved.</span>
          </p>

          <nav className="flex items-center gap-4">
            <Link to={ROUTES.LOGIN} className="hover:text-gray-900 dark:hover:text-white">
              Sign in
            </Link>
            <Link to={ROUTES.REGISTER} className="hover:text-gray-900 dark:hover:text-white">
              Register
            </Link>
          </nav>
        </div>

        <Footer className="border-0 border-t border-gray-200 dark:border-gray-800" />
      </footer>
    </div>
  );
};

export default LandingPage;
