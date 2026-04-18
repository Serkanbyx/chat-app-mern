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
 *
 * The GitHub mark is inlined as SVG because Lucide v1 removed all
 * brand icons (trademark/licensing concerns); pulling in another
 * icon library just for one glyph would be wasteful.
 */
const GithubIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.1-3.13.68-3.79-1.34-3.79-1.34-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.29-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.16.89-.25 1.85-.37 2.8-.37.95 0 1.91.12 2.8.37 2.14-1.46 3.08-1.16 3.08-1.16.61 1.55.23 2.69.11 2.98.72.79 1.16 1.8 1.16 3.03 0 4.33-2.64 5.29-5.15 5.57.4.34.76 1.02.76 2.06 0 1.49-.01 2.69-.01 3.05 0 .3.2.65.78.54 4.46-1.49 7.68-5.7 7.68-10.67C23.25 5.48 18.27.5 12 .5z"
    />
  </svg>
);

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
          <GithubIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>GitHub</span>
        </a>
      </p>
    </footer>
  );
};

export default Footer;
