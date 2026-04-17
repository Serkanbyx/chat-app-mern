/**
 * In-memory presence registry: `userId -> Set<socketId>`.
 *
 * Why a Set per user:
 *   - A single user can be connected from multiple devices/tabs at once
 *     (web + mobile, or two open windows). Each device opens its own
 *     socket, but presence ("is the user online?") is per-user.
 *   - Storing a set lets us treat the user as online while ANY socket
 *     is alive, and only flip to offline when the LAST socket drops.
 *
 * Why in-memory and not Redis:
 *   - Single-process deployment for this app. If horizontal scaling is
 *     ever introduced, this module becomes the seam to swap with
 *     `@socket.io/redis-adapter` + a Redis-backed Map. The exported API
 *     is intentionally tiny so that swap is a one-file change.
 *
 * Keys are stringified ObjectIds. Mongoose ObjectIds and string ids
 * compare differently (`===`), so we coerce on every entry/exit to
 * keep callers from worrying about the type.
 */

const userSockets = new Map();

const toKey = (userId) => String(userId);

export const addUserSocket = (userId, socketId) => {
  const key = toKey(userId);
  let set = userSockets.get(key);
  if (!set) {
    set = new Set();
    userSockets.set(key, set);
  }
  set.add(socketId);
  return set.size;
};

/**
 * Removes a single socket binding. Returns the number of remaining
 * sockets for this user (0 means "fully offline now"), so the caller
 * can decide whether to broadcast a `userOffline` event.
 */
export const removeUserSocket = (userId, socketId) => {
  const key = toKey(userId);
  const set = userSockets.get(key);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) {
    userSockets.delete(key);
    return 0;
  }
  return set.size;
};

export const getUserSocketIds = (userId) =>
  userSockets.get(toKey(userId)) ?? new Set();

export const isUserOnline = (userId) => userSockets.has(toKey(userId));

export const getOnlineUserIds = () => Array.from(userSockets.keys());

/** Test/diagnostic helper. Not exported through the socket layer. */
export const _resetOnlineUsers = () => {
  userSockets.clear();
};
