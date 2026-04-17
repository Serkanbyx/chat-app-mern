import clsx from 'clsx';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';

/**
 * MessageStatusTicks — WhatsApp-style delivery indicator on the
 * sender's own bubbles. Five terminal states:
 *
 *   pending  → grey clock              (optimistic bubble, no server _id)
 *   failed   → red exclamation         (send rejected / timed out)
 *   sent     → single grey ✓           (server acknowledged + persisted)
 *   partial  → single grey ✓ + tooltip (group: read by some, not all)
 *   read     → double brand ✓✓         (read by every recipient)
 *
 * The component is purely presentational. The deciding logic lives in
 * the bubble (it has the message + currentUserId in scope) so this file
 * stays a one-prop primitive that's trivial to swap or restyle.
 *
 * Privacy:
 *   - The "read" / "partial" states are downgraded to "sent" by the
 *     bubble whenever the viewer's `showReadReceipts` preference is
 *     OFF — the server already suppresses the readBy broadcast in that
 *     case, but we double-check on render so a stale receipt cached
 *     client-side cannot leak.
 *   - The tooltip on `partial` shows ONLY counts ("Read by 2/4"), never
 *     the list of users who have / have not read. Surfacing identities
 *     in a group chat would broadcast individual reading habits.
 */

const STATUS_CLASSES = {
  pending: 'text-gray-300 dark:text-gray-500',
  sent: 'text-gray-400 dark:text-gray-500',
  partial: 'text-gray-400 dark:text-gray-500',
  read: 'text-brand-500 dark:text-brand-300',
  failed: 'text-red-500 dark:text-red-400',
};

const STATUS_LABELS = {
  pending: 'Sending',
  sent: 'Sent',
  partial: 'Read by some',
  read: 'Read',
  failed: 'Failed to send',
};

const ICONS = {
  pending: Clock,
  sent: Check,
  partial: Check,
  read: CheckCheck,
  failed: AlertCircle,
};

const MessageStatusTicks = ({ status = 'sent', tooltip = '', className }) => {
  const variant = STATUS_CLASSES[status] ? status : 'sent';
  const Icon = ICONS[variant] ?? Check;
  const label = tooltip || STATUS_LABELS[variant];

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={clsx('inline-flex shrink-0', STATUS_CLASSES[variant], className)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
};

export default MessageStatusTicks;
