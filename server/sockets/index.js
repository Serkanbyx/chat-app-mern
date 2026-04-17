import { isProduction } from '../config/env.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { socketAuthMiddleware } from './auth.socket.js';
import {
  addUserSocket,
  removeUserSocket,
} from './onlineUsers.js';
import {
  broadcastUserOffline,
  broadcastUserOnline,
  getShowOnlineStatus,
  registerPresenceHandlers,
} from './presence.socket.js';
import {
  clearTypingForUser,
  registerTypingHandlers,
} from './typing.socket.js';
import { convRoom, userRoom } from './rooms.js';

/**
 * Wire connection / disconnection lifecycle and the per-feature event
 * handlers (presence, typing, messaging, groups). This file owns the
 * connection lifecycle so that the membership and presence invariants
 * are enforced in exactly one place. Per-feature behaviour lives in
 * its own module under `sockets/`.
 *
 * Room model recap (see `sockets/rooms.js`):
 *   - `user:<userId>`         — every device of one user
 *   - `conv:<conversationId>` — every participant of a chat
 *
 * The server is the single source of truth for room membership. We
 * NEVER call `socket.join(client-supplied room)` — every join is the
 * result of a DB-verified participant lookup, which makes it
 * impossible for a malicious client to subscribe to a room they don't
 * belong to.
 */
export const registerSocketHandlers = (io) => {
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    const userId = socket.user._id;

    try {
      addUserSocket(userId, socket.id);

      // Personal room — used for direct fan-out to all of a user's
      // devices (e.g. notifications, admin force-disconnect) and for
      // `.except(userRoom(...))` exclusions on broadcasts they triggered.
      socket.join(userRoom(userId));

      // Auto-subscribe to every conversation room the user belongs to.
      // Pulling only `_id` keeps the payload tiny on users who are in
      // hundreds of conversations.
      const conversations = await Conversation.find(
        { participants: userId, isActive: true },
        '_id',
      ).lean();

      const roomNames = conversations.map((c) => convRoom(c._id));
      if (roomNames.length > 0) socket.join(roomNames);

      // Flip presence flag and read the privacy preference in one
      // round-trip. `findByIdAndUpdate` keeps us off the full mongoose
      // validation pipeline on a hot path that only touches two fields.
      const updated = await User.findByIdAndUpdate(
        userId,
        { isOnline: true, lastSeenAt: new Date() },
        { new: true, projection: 'preferences.showOnlineStatus' },
      ).lean();

      const showOnlineStatus =
        updated?.preferences?.showOnlineStatus !== false;

      // Cache on the socket so the disconnect handler doesn't need a
      // second lookup. Acceptable staleness window: from connect to
      // disconnect of THIS socket — toggling the setting takes effect
      // on the next socket lifecycle event, which matches REST behaviour.
      socket.data.showOnlineStatus = showOnlineStatus;

      // STEP 14 — privacy-aware presence broadcast. Skipped entirely
      // when the user has opted out of `showOnlineStatus`.
      broadcastUserOnline(io, userId, roomNames, showOnlineStatus);

      // Per-feature handlers. Each module is responsible for its own
      // payload validation, authorisation and error handling so a bug
      // in one feature can't bring down the whole socket layer.
      registerPresenceHandlers(io, socket); // STEP 14
      registerTypingHandlers(io, socket); // STEP 14
      // STEP 15 will register:
      //   registerMessageHandlers(io, socket);
      //   registerGroupHandlers(io, socket);

      if (!isProduction) {
        console.log(
          `[socket] connected user=${userId} socket=${socket.id} rooms=${roomNames.length}`,
        );
      }
    } catch (err) {
      // Connection-time failures cannot use ack callbacks — the only
      // way to surface them is to disconnect the socket. We never
      // forward the raw error to the client (info-leak), only a
      // generic reason that the client can map to a retry/login flow.
      console.error('[socket] connection setup failed:', err);
      socket.emit('server:error', { message: 'Connection setup failed' });
      socket.disconnect(true);
      return;
    }

    socket.on('disconnect', async (reason) => {
      try {
        const remaining = removeUserSocket(userId, socket.id);

        // Only the LAST socket dropping flips the user offline. While
        // any other tab/device is still connected, presence stays on
        // and typing state for those other tabs remains valid.
        if (remaining === 0) {
          const lastSeenAt = new Date();
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeenAt,
          });

          // Re-derive room list from DB. Using `socket.rooms` here
          // would be unreliable: by the time `disconnect` fires,
          // Socket.io has already cleared this socket's room set.
          const conversations = await Conversation.find(
            { participants: userId, isActive: true },
            '_id',
          ).lean();
          const roomNames = conversations.map((c) => convRoom(c._id));

          // Re-read the privacy preference rather than reusing the
          // cached value — the user may have toggled the setting after
          // connecting from this socket. Falls back to `true` if the
          // user document is gone (deleted) so we don't strand other
          // participants showing them as eternally online.
          const showOnlineStatus = await getShowOnlineStatus(userId);

          broadcastUserOffline(
            io,
            userId,
            roomNames,
            lastSeenAt,
            showOnlineStatus,
          );

          // Drop any typing entries this user still owns. Without this
          // a crashed client (no `typing:stop` sent) would leave its
          // indicator stuck for the 5-second auto-stop fallback.
          clearTypingForUser(io, userId);
        }

        if (!isProduction) {
          console.log(
            `[socket] disconnected user=${userId} socket=${socket.id} reason=${reason} remaining=${remaining}`,
          );
        }
      } catch (err) {
        console.error('[socket] disconnect cleanup failed:', err);
      }
    });
  });

  // Engine-level errors (handshake rejected by middleware, transport
  // upgrade failures). Logged centrally so a flood of bad-token
  // attempts is visible in the server logs.
  io.engine.on('connection_error', (err) => {
    if (!isProduction) {
      console.warn(
        `[socket] connection_error code=${err.code} message=${err.message}`,
      );
    }
  });
};

export default registerSocketHandlers;
