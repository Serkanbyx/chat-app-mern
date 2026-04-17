import ConfirmModal from '../common/ConfirmModal.jsx';

/**
 * BlockUserModal — destructive confirmation surface for the "Block"
 * action on a profile / message header.
 *
 * The actual `blockUser` API call is intentionally pushed back to the
 * caller (via `onConfirm`) so the parent owns the optimistic update —
 * a profile page wants to flip its CTA from "Send message" to
 * "Unblock", a chat header wants to disable the composer, etc.
 */
const BlockUserModal = ({ open, onClose, onConfirm, target }) => {
  const targetName = target?.displayName || target?.username || 'this user';

  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Block user?"
      confirmLabel="Block user"
      cancelLabel="Cancel"
      variant="danger"
    >
      <p>
        <span className="font-semibold text-gray-900 dark:text-white">
          {targetName}
        </span>{' '}
        will no longer be able to message you. They won&apos;t be told
        you&apos;ve blocked them.
      </p>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        You can unblock anyone from{' '}
        <span className="font-medium">Settings &rarr; Blocked Users</span>.
      </p>
    </ConfirmModal>
  );
};

export default BlockUserModal;
