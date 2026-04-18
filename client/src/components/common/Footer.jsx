import { Github } from 'lucide-react';

/**
 * Footer — global signature strip rendered at the bottom of every
 * non-chat surface (auth flow + the generic authenticated shell).
 *
 * Kept dependency-free and theme-aware so it can sit underneath any
 * page without leaking layout (no fixed positioning, no z-index
 * gymnastics) and without forcing colour decisions on the host.
 *
 * The "Created by …" links are external, so we always pair
 * `target="_blank"` with `rel="noopener noreferrer"` to prevent the
 * destination from gaining a `window.opener` handle and to opt out
 * of the referrer header.
 */
const Footer = ({ className = '' }) => {
  const year = new Date().getFullYear();

  return (
    <footer
      className={`sign w-full border-t border-gray-200 bg-white/60 px-4 py-4 text-center text-xs text-gray-500 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-400 ${className}`.trim()}
    >
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>&copy; {year} Chat App</span>
        <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">
          •
        </span>
        <span>
          Created by{' '}
          <a
            href="https://serkanbayraktar.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 underline-offset-2 transition-colors hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
          >
            Serkanby
          </a>
        </span>
        <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">
          |
        </span>
        <a
          href="https://github.com/Serkanbyx"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub profile of Serkanby"
          className="inline-flex items-center gap-1 font-medium text-brand-600 underline-offset-2 transition-colors hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
        >
          <Github className="h-3.5 w-3.5" aria-hidden="true" />
          <span>GitHub</span>
        </a>
      </p>
    </footer>
  );
};

export default Footer;
