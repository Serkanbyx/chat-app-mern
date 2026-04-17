import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { convRoom, userRoom } from './rooms.js';

const { Types } = mongoose;

/**
 * Throttle / safety-net constants. Pulled out as named values so they
 * can be tuned (or exported for tests) without code archaeology.
 */
const TYPING_THROTTLE_MS = 2000; // suppress re-broadcast within 2s
const TYPING_AUTO_STOP_MS = 5000; // server-side stop if client goes silent

/**
 * Per-(conversation, user) state for the typing indicator.
 *
 *   key   = `${conversationId}:${userId}`
 *   value = { lastBroadcastAt: number, autoStopTimer: NodeJS.Timeout|null }
 *
 * Why in-memory (not Redis): typing state is ephemeral and only
 * meaningful for the lifetime of a single process. If horizontal
 * scaling is added later, this map becomes the seam to swap with a
 * sticky-routing or Redis-backed store — its public surface is small
 * (`getEntry`, `clearEntry`, `clearAllForUser`).
 */
const typingState = new Map();

const stateKey = (conversationId, userId) => `${conversationId}:${userId}`;

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{24}$/i.test(value) &&
  Types.ObjectId.isValid(value);

const clearEntry = (key) => {
  const entry = typingState.get(key);
  if (entry?.autoStopTimer) clearTimeout(entry.autoStopTimer);
  typingState.delete(key);
};

/**
 * Drop every typing entry tied to a given user — invoked when the
 * user's LAST socket disconnects so other participants see the
 * indicator vanish even if the client never sent `typing:stop`.
 */
export const clearTypingForUser = (io, userId) => {
  const suffix = `:${String(userId)}`;
  for (const key of typingState.keys()) {
    if (!key.endsWith(suffix)) continue;
    const conversationId = key.slice(0, key.length - suffix.length);
    clearEntry(key);
    // Best-effort fan-out — recipients should treat `typing:stop` as
    // idempotent so duplicate emits are harmless.
    io.to(convRoom(conversationId))
      .except(userRoom(userId))
      .emit('typing:stop', { conversationId, userId: String(userId) });
  }
};

/**
 * Validate the payload coming off the wire and confirm the sender is
 * actually a participant of the target conversation. Returns the
 * normalised conversation id, or `null` if validation fails (caller
 * should silently drop — typing is fire-and-forget, no ack channel).
 *
 * NOTE: We hit the DB on every typing event. That's intentional — it
 * means a user removed from a group cannot keep injecting typing into
 * the room. The query is `_id` + indexed `participants`, so it's cheap.
 */
const validateTypingPayload = async (payload, userId) => {
  if (!payload || typeof payload !== 'object') return null;
  const { conversationId } = payload;
  if (!isValidObjectId(conversationId)) return null;

  const conversation = await Conversation.findOne(
    { _id: conversationId, participants: userId, isActive: true },
    '_id',
  ).lean();

  return conversation ? conversationId : null;
};

/**
 * Wire `typing:start` and `typing:stop` for a single socket.
 *
 * Server is the single source of truth for room membership and the
 * throttle window. Clients only declare *intent* — we decide whether
 * (and to whom) the event is broadcast.
 */
export const registerTypingHandlers = (io, socket) => {
  const userId = String(socket.user._id);

  socket.on('typing:start', async (payload) => {
    try {
      const conversationId = await validateTypingPayload(payload, userId);
      if (!conversationId) return;

      const key = stateKey(conversationId, userId);
      const now = Date.now();
      const existing = typingState.get(key);

      // Always refresh the safety-net auto-stop timer — every keystroke
      // resets the 5-second silence window so a chatty user never
      // accidentally triggers the stop event.
      if (existing?.autoStopTimer) clearTimeout(existing.autoStopTimer);

      const autoStopTimer = setTimeout(() => {
        clearEntry(key);
        io.to(convRoom(conversationId))
          .except(userRoom(userId))
          .emit('typing:stop', { conversationId, userId });
      }, TYPING_AUTO_STOP_MS);

      // Suppress re-broadcast inside the throttle window. We still
      // refreshed the auto-stop timer above, so the safety-net stays
      // aligned with the most recent keystroke.
      if (existing && now - existing.lastBroadcastAt < TYPING_THROTTLE_MS) {
        typingState.set(key, {
          lastBroadcastAt: existing.lastBroadcastAt,
          autoStopTimer,
        });
        return;
      }

      typingState.set(key, { lastBroadcastAt: now, autoStopTimer });

      io.to(convRoom(conversationId))
        .except(userRoom(userId))
        .emit('typing:start', { conversationId, userId });
    } catch {
      // Swallow — typing is best-effort, never crash the socket on it.
    }
  });

  socket.on('typing:stop', async (payload) => {
    try {
      const conversationId = await validateTypingPayload(payload, userId);
      if (!conversationId) return;

      const key = stateKey(conversationId, userId);
      const hadEntry = typingState.has(key);
      clearEntry(key);

      // Only broadcast `typing:stop` if there was an active typing
      // entry — otherwise we'd flood rooms with no-op stops every time
      // a focus/blur fires on the composer.
      if (hadEntry) {
        io.to(convRoom(conversationId))
          .except(userRoom(userId))
          .emit('typing:stop', { conversationId, userId });
      }
    } catch {
      // Same rationale as `typing:start`.
    }
  });
};

export default registerTypingHandlers;

// Exposed for tests / diagnostics — not part of the public socket surface.
export const _internals = {
  typingState,
  stateKey,
  TYPING_THROTTLE_MS,
  TYPING_AUTO_STOP_MS,
  _reset: () => {
    for (const key of typingState.keys()) clearEntry(key);
  },
};
