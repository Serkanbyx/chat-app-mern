import Badge from '../common/Badge.jsx';

/**
 * UnreadBadge — thin wrapper around the generic `Badge` that fixes the
 * variant + max threshold used everywhere in the chat surface.
 *
 * Centralising this means flipping the visual treatment of unread pills
 * (e.g. switching from danger-red to brand-blue) is a one-file change
 * instead of a sweep across `Sidebar`, `Navbar`, and `MobileNav`.
 */
const UnreadBadge = ({ count, className }) => (
  <Badge count={count} max={99} variant="brand" className={className} />
);

export default UnreadBadge;
