/**
 * Per-(conversation, user) "is the chat window open right now?" registry.
 *
 * Why we need this:
 *   On `connection` every socket auto-joins all of the user's conversation
 *   rooms (see `sockets/index.js`) so live messages reach every device.
 *   That means "user is in conv:<id> room" is true for ALL their sockets
 *   AT ALL TIMES — it cannot be used to decide whether to send a push-style
 *   `notification:new`. We need a separate signal telling us the user is
 *   actively LOOKING at this conversation right now (chat window focused),
 *   so we suppress the notification for them.
 *
 *   Clients announce focus via `conversation:open` and revoke it via
 *   `conversation:close` (or by disconnecting). The handler stores the
 *   active conversation id on `socket.data.activeConversationId` AND
 *   bumps a counter here so multi-device users don't get spurious
 *   notifications when one tab is on the conversation and another isn't.
 *
 * Why a refcount instead of a boolean:
 *   A user with two tabs both open on the same conversation must NOT see
 *   the notification suppression flip off when they close one tab. The
 *   counter only reaches zero when EVERY focused tab/socket has closed.
 *
 * Why in-memory:
 *   Same rationale as `onlineUsers.js` — ephemeral, only meaningful for
 *   the lifetime of a single process. The exported surface is tiny so
 *   swapping for Redis later is a one-file change.
 */

const viewers = new Map();

const key = (conversationId, userId) => `${conversationId}:${userId}`;

/**
 * Increment the focus refcount for `(conversationId, userId)`. Returns the
 * new count so the caller can branch on "first focus" if needed.
 */
export const addActiveViewer = (conversationId, userId) => {
  const k = key(String(conversationId), String(userId));
  const current = viewers.get(k) ?? 0;
  const next = current + 1;
  viewers.set(k, next);
  return next;
};

/**
 * Decrement the focus refcount. Deletes the entry when it drops to zero
 * so an idle process never accumulates dead keys. Negative refcounts
 * (double-close, race) are coerced to zero — a desync should never leave
 * a notification permanently suppressed.
 */
export const removeActiveViewer = (conversationId, userId) => {
  const k = key(String(conversationId), String(userId));
  const current = viewers.get(k) ?? 0;
  if (current <= 1) {
    viewers.delete(k);
    return 0;
  }
  const next = current - 1;
  viewers.set(k, next);
  return next;
};

/**
 * "Should this user receive a `notification:new` for this conversation?"
 * Returns `true` when at least one of their sockets has the chat window
 * open — in that case, the caller skips the notification.
 */
export const isUserActiveInConversation = (conversationId, userId) =>
  (viewers.get(key(String(conversationId), String(userId))) ?? 0) > 0;

/**
 * Disconnect cleanup: drop every focus entry tied to a single socket.
 * Reads the cached active conversation off `socket.data` rather than
 * scanning the whole map, which keeps disconnect O(1) regardless of how
 * many users are currently focused on something.
 */
export const clearActiveForSocket = (socket) => {
  const userId = socket?.user?._id;
  const activeId = socket?.data?.activeConversationId;
  if (!userId || !activeId) return;
  removeActiveViewer(activeId, userId);
  socket.data.activeConversationId = null;
};

/** Test/diagnostic helper. Not part of the public socket surface. */
export const _resetActiveConversations = () => {
  viewers.clear();
};
