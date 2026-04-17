import { Server } from 'socket.io';

/**
 * Build a Socket.io server attached to the existing HTTP server.
 *
 * Why a factory instead of a top-level singleton:
 *   - Keeps `index.js` declarative (compose, then start).
 *   - Makes the `io` instance trivially injectable in tests (pass a fake
 *     httpServer / spy on emits) without monkey-patching imports.
 *
 * Configuration rationale:
 *   - `cors`: must mirror REST exactly. The browser's WebSocket upgrade
 *     handshake is also CORS-checked when `credentials: true` is set,
 *     so a single source of truth (`env.CLIENT_URL`) prevents drift.
 *   - `pingInterval` / `pingTimeout`: tuned for typical residential
 *     networks. 25 s ping with a 60 s grace window catches dropped
 *     mobile connections without firing false-positive disconnects on
 *     brief tab freezes (laptop sleep, GC pauses, etc.).
 *   - `maxHttpBufferSize: 1e6` (1 MB): hard cap on a single payload.
 *     Real chat messages are < 10 KB; image bytes never travel through
 *     the socket layer (uploaded via /api/upload first, only the URL is
 *     emitted). This protects the process from a memory-exhaustion DoS.
 */
export const createSocketServer = (httpServer, env) =>
  new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25_000,
    pingTimeout: 60_000,
    maxHttpBufferSize: 1e6,
  });

export default createSocketServer;
