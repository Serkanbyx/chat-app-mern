import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { isUserOnline } from './onlineUsers.js';
import { userRoom } from './rooms.js';

const { Types } = mongoose;

/**
 * Hard cap on `presence:list` input. A list of 200 ids covers any
 * realistic sidebar viewport while preventing a malicious client from
 * shipping a 100 000-element array to force a giant DB query.
 */
const PRESENCE_LIST_MAX_IDS = 200;

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{24}$/i.test(value) &&
  Types.ObjectId.isValid(value);

/**
 * Strip duplicates and obviously bogus ids before they reach Mongoose.
 * We never trust the array length or element shape coming off the wire.
 */
const sanitizeIdList = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const value of raw) {
    if (seen.size >= PRESENCE_LIST_MAX_IDS) break;
    if (typeof value !== 'string') continue;
    if (!isValidObjectId(value)) continue;
    seen.add(value);
  }
  return Array.from(seen);
};

/**
 * Look up the privacy flag for a single user. Used on connect/disconnect
 * to decide whether to broadcast presence transitions at all. We read it
 * fresh (not from the handshake snapshot) so toggling the setting takes
 * effect on the next socket lifecycle event without a re-login.
 */
export const getShowOnlineStatus = async (userId) => {
  const doc = await User.findById(userId)
    .select('preferences.showOnlineStatus')
    .lean();
  // Default to `true` if the field is missing — matches the schema default.
  return doc?.preferences?.showOnlineStatus !== false;
};

/**
 * Emit `userOnline` to every conversation room the user just joined,
 * but skip the broadcast entirely if the user opted out of online-status
 * sharing. We also `.except(userRoom(userId))` so the user's other tabs
 * don't receive a self-notification (they observe their own presence
 * via the local socket connection state).
 */
export const broadcastUserOnline = (
  io,
  userId,
  roomNames,
  showOnlineStatus,
) => {
  if (!showOnlineStatus || roomNames.length === 0) return;
  for (const name of roomNames) {
    io.to(name).except(userRoom(userId)).emit('userOnline', { userId });
  }
};

/**
 * Mirror of `broadcastUserOnline` for the offline transition. Called
 * only when the user's LAST socket drops, so we don't need to exclude
 * the user's own room — there are no remaining tabs to receive it.
 */
export const broadcastUserOffline = (
  io,
  userId,
  roomNames,
  lastSeenAt,
  showOnlineStatus,
) => {
  if (!showOnlineStatus || roomNames.length === 0) return;
  for (const name of roomNames) {
    io.to(name).emit('userOffline', { userId, lastSeenAt });
  }
};

/**
 * Wire per-socket presence event handlers. Currently only `presence:list`
 * lives here — `userOnline`/`userOffline` are emitted from the connection
 * lifecycle in `sockets/index.js` via the helpers above.
 */
export const registerPresenceHandlers = (io, socket) => {
  /**
   * `presence:list`: client asks for the online state of a known set of
   * users (typically the rendered conversation list). Returns a map
   * `{ [userId]: boolean }`. Users with `showOnlineStatus: false` are
   * always reported as `false` regardless of their real state — the
   * server is the single point of enforcement for this privacy setting.
   *
   * Always invokes the ack callback (success OR failure) so the client
   * never hangs on a missing response.
   */
  socket.on('presence:list', async (payload, ack) => {
    const respond = typeof ack === 'function' ? ack : () => {};

    try {
      const ids = sanitizeIdList(payload?.userIds);
      if (ids.length === 0) {
        return respond({ success: true, presence: {} });
      }

      // Fetch only the privacy flag — we already know online state in-process.
      const docs = await User.find(
        { _id: { $in: ids } },
        'preferences.showOnlineStatus',
      ).lean();

      const allowsBroadcast = new Map();
      for (const doc of docs) {
        allowsBroadcast.set(
          String(doc._id),
          doc?.preferences?.showOnlineStatus !== false,
        );
      }

      const presence = {};
      for (const id of ids) {
        // Unknown users (deleted, never existed) report `false` — never
        // 404 here, since enumeration of "does this id exist" is its own
        // info-leak vector.
        if (!allowsBroadcast.get(id)) {
          presence[id] = false;
          continue;
        }
        presence[id] = isUserOnline(id);
      }

      return respond({ success: true, presence });
    } catch {
      // Generic failure surface — handler errors must never crash the
      // socket layer or leak DB-level details to the client.
      return respond({ success: false, message: 'presence:list failed' });
    }
  });
};

export default registerPresenceHandlers;

// Exposed for tests; not part of the public socket surface.
export const _internals = { sanitizeIdList, isValidObjectId };
