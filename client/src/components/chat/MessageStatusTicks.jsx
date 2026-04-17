import clsx from 'clsx';
import { Check, CheckCheck, Clock } from 'lucide-react';

/**
 * MessageStatusTicks — WhatsApp-style delivery indicator on the
 * sender's own bubbles. Three terminal states:
 *
 *   pending  → grey clock     (optimistic bubble, no server _id yet)
 *   sent     → single grey ✓  (server acknowledged + persisted)
 *   read     → double blue ✓✓ (at least one OTHER participant has read)
 *
 * The component is purely presentational. The deciding logic lives in
 * the bubble (it has the message + currentUserId in scope) so this file
 * stays a one-prop primitive that's trivial to swap or restyle.
 *
 * Privacy:
 *   The "read" state is downgraded to "sent" by the bubble whenever the
 *   viewer's `showReadReceipts` preference is OFF — the server already
 *   suppresses the readBy broadcast in that case, but we double-check
 *   on render so a stale receipt cached client-side cannot leak.
 */

const STATUS_CLASSES = {
  pending: 'text-gray-300 dark:text-gray-500',
  sent: 'text-gray-400 dark:text-gray-500',
  read: 'text-brand-500 dark:text-brand-300',
};

const STATUS_LABELS = {
  pending: 'Sending',
  sent: 'Sent',
  read: 'Read',
};

const MessageStatusTicks = ({ status = 'sent', className }) => {
  const variant = STATUS_CLASSES[status] ? status : 'sent';
  const Icon = variant === 'pending' ? Clock : variant === 'read' ? CheckCheck : Check;

  return (
    <span
      role="img"
      aria-label={STATUS_LABELS[variant]}
      className={clsx('inline-flex shrink-0', STATUS_CLASSES[variant], className)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
};

export default MessageStatusTicks;
