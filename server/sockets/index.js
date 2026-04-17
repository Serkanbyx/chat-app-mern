import { isProduction } from '../config/env.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { socketAuthMiddleware } from './auth.socket.js';
import {
  addUserSocket,
  removeUserSocket,
} from './onlineUsers.js';

/**
 * Naming convention for rooms:
 *   - `user:<userId>`        — fan-out to every device of one user
 *                              (notifications, force-disconnect, etc.).
 *   - `conv:<conversationId>` — fan-out to all participants of a chat.
 *
 * The server is the single source of truth for room membership. We
 * NEVER call `socket.join(client-supplied room)` — every join is the
 * result of a DB-verified participant lookup. This makes it impossible
 * for a malicious client to subscribe to a room they don't belong to.
 */
const userRoom = (userId) => `user:${userId}`;
const convRoom = (conversationId) => `conv:${conversationId}`;

/**
 * Wire connection / disconnection lifecycle and the per-feature event
 * handlers (presence, typing, messaging, groups). Per-feature handlers
 * are registered in subsequent steps; this file owns the connection
 * lifecycle so that the membership / presence invariants are enforced
 * in exactly one place.
 */
export const registerSocketHandlers = (io) => {
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    const userId = socket.user._id;

    try {
      addUserSocket(userId, socket.id);

      // Personal room — used for direct fan-out to all of a user's
      // devices (e.g. notifications, admin force-disconnect).
      socket.join(userRoom(userId));

      // Auto-subscribe to every conversation room the user belongs to.
      // We pull only `_id` to keep the payload tiny on users who are in
      // hundreds of conversations.
      const conversations = await Conversation.find(
        { participants: userId, isActive: true },
        '_id',
      ).lean();

      const roomNames = conversations.map((c) => convRoom(c._id));
      if (roomNames.length > 0) socket.join(roomNames);

      // Flip presence flag. We use `findByIdAndUpdate` (not `save`) to
      // avoid running the full validation pipeline on a hot path that
      // only touches two fields.
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeenAt: new Date(),
      });

      // Notify other participants. We exclude this user's own personal
      // room (their other tabs already know they're online — they're
      // the source of the event). STEP 14 will harden this against the
      // `showOnlineStatus` privacy setting.
      for (const name of roomNames) {
        socket.to(name).emit('userOnline', { userId });
      }

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

    // Per-feature handlers wired in later steps:
    //   STEP 14 — presence + typing
    //   STEP 15 — messaging, reactions, read, group events
    // They will be imported and called here as:
    //   registerPresenceHandlers(io, socket);
    //   registerTypingHandlers(io, socket);
    //   registerMessageHandlers(io, socket);
    //   registerGroupHandlers(io, socket);

    socket.on('disconnect', async (reason) => {
      try {
        const remaining = removeUserSocket(userId, socket.id);

        // Only the LAST socket dropping flips the user offline. While
        // any other tab/device is still connected, presence stays on.
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

          for (const conv of conversations) {
            io.to(convRoom(conv._id)).emit('userOffline', {
              userId,
              lastSeenAt,
            });
          }
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
