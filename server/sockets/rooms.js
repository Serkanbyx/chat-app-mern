/**
 * Room naming convention used across the WebSocket layer.
 *
 *   - `user:<userId>`         — fan-out to every device of one user
 *                               (notifications, force-disconnect,
 *                               "exclude my own tabs from this event").
 *   - `conv:<conversationId>` — fan-out to all participants of a chat.
 *
 * Centralised here so every emitter uses the same string format. Drift
 * between `user:` / `users:` / `u:` would silently break delivery and
 * is impossible to lint for at the call site, so we route through these
 * helpers instead of formatting strings inline.
 */
export const userRoom = (userId) => `user:${userId}`;
export const convRoom = (conversationId) => `conv:${conversationId}`;
