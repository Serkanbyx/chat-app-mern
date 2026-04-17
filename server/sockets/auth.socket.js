import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { USER_STATUS } from '../utils/constants.js';

/**
 * Pull a JWT off the handshake. Two transports are accepted, in order:
 *   1. `socket.handshake.auth.token`  (preferred — set by `io({ auth })`).
 *   2. `Authorization: Bearer <t>`    (fallback for non-browser clients).
 *
 * Cookies and query strings are intentionally NOT supported. Mirroring
 * the REST contract (Bearer header only) keeps the token surface tiny
 * and removes CSRF concerns from the WebSocket transport.
 */
const extractToken = (socket) => {
  const fromAuth = socket.handshake?.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) {
    return fromAuth.trim();
  }

  const header = socket.handshake?.headers?.authorization;
  if (typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme === 'Bearer' && token) return token.trim();
  }

  return null;
};

/**
 * Socket.io connection-time authentication.
 *
 * Runs ONCE per socket, during the handshake. If `next` is called with
 * an Error, Socket.io aborts the connection before any event handler
 * fires — so downstream handlers can safely assume `socket.user` exists.
 *
 * Security notes:
 *   - The user is re-fetched from the database (not trusted from the
 *     token claims) so that `status` changes (suspend / delete) take
 *     effect on the next connection without waiting for token expiry.
 *   - Live sockets of suspended users are killed by the admin layer
 *     (STEP 17) via `io.to('user:<id>').disconnectSockets(true)`.
 *   - Error messages are intentionally generic ("Unauthorized") to
 *     avoid leaking which step failed (token vs user vs status).
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error('Unauthorized'));

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return next(new Error('Unauthorized'));
    }

    if (!payload?.id) return next(new Error('Unauthorized'));

    const user = await User.findById(payload.id)
      .select('_id username displayName role status')
      .lean();

    if (!user) return next(new Error('Unauthorized'));
    if (user.status !== USER_STATUS.ACTIVE) {
      return next(new Error('Unauthorized'));
    }

    // Attach the minimum surface the handlers need. Anything else
    // (preferences, blocked lists, etc.) is fetched on demand to avoid
    // serving stale data from the handshake snapshot.
    socket.user = {
      _id: String(user._id),
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };

    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
};

export default socketAuthMiddleware;
