import { convRoom, userRoom } from './rooms.js';

/**
 * Group-lifecycle WebSocket fan-out.
 *
 * This module is server-emit only — every group operation (`createGroup`,
 * `addMembers`, `promoteAdmin`, …) is reached through REST. The helpers
 * below let those REST controllers broadcast the resulting state change
 * to every relevant socket using the same room model as messaging.
 *
 * Room-membership invariant maintained here:
 *   - When someone joins a group, all of their currently-connected sockets
 *     MUST be added to `conv:<id>` so they receive in-flight messages.
 *   - When someone leaves (or is removed), all of their sockets MUST be
 *     removed from `conv:<id>` so they stop receiving messages from the
 *     group they no longer belong to. The DB is the source of truth, but
 *     leaving the rooms in sync is what makes the "leave is instant"
 *     UX work without forcing a reconnect.
 *
 * Why all helpers accept pre-serialized payloads:
 *   The REST controllers already render conversations through their own
 *   `serializeConversation` (privacy masking, viewer-scoped unread, …).
 *   Re-running that logic here would either (a) duplicate the rules or
 *   (b) leak fields the REST layer just stripped. Keeping serialization
 *   in the controller keeps a single source of truth.
 */

const isValidIds = (ids) =>
  Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.length > 0);

/**
 * `group:created` — a brand new group has been persisted. Every member
 * (including the creator) needs to:
 *   1. Receive the full populated conversation so the sidebar renders it
 *      without an extra GET.
 *   2. Have their currently-connected sockets joined to `conv:<id>` so
 *      live messages start flowing without a reconnect.
 *
 * `conversation` here is the wire object — already serialized by the
 * controller. We do NOT serialize again to avoid leaking fields the
 * controller intentionally stripped.
 */
export const emitGroupCreated = (io, { conversation, memberIds }) => {
  if (!io || !conversation || !isValidIds(memberIds)) return;
  const conversationId = String(conversation._id);
  const room = convRoom(conversationId);

  for (const memberId of memberIds) {
    // `socketsJoin` runs across all sockets that are currently in the
    // member's user room — covers every device they have open right now.
    // New connections will pick the room up via the auto-join in
    // `sockets/index.js` on their next handshake.
    io.in(userRoom(memberId)).socketsJoin(room);
    io.to(userRoom(memberId)).emit('group:created', { conversation });
  }
};

/**
 * `group:memberAdded` — one or more users have been added to an existing
 * group. Existing members get one delta event PER added user (matches
 * the spec payload `{ conversationId, user, byUserId }`) so the client
 * can run its append logic per-row; new members additionally receive
 * the full conversation (same shape as `group:created`) and have their
 * sockets joined to the room.
 *
 * `addedUsers`: array of pre-serialized user objects (already privacy-
 * masked by the caller). Order MUST match `addedUserIds`.
 */
export const emitGroupMemberAdded = (
  io,
  { conversation, addedUsers, addedUserIds, byUserId },
) => {
  if (!io || !conversation || !Array.isArray(addedUsers)) return;
  if (!isValidIds(addedUserIds)) return;

  const conversationId = String(conversation._id);
  const room = convRoom(conversationId);
  const actor = byUserId ? String(byUserId) : null;

  // 1) Onboard the new members BEFORE notifying existing ones, so a
  //    `message:new` racing immediately after the add reaches them too.
  for (const newId of addedUserIds) {
    io.in(userRoom(newId)).socketsJoin(room);
    io.to(userRoom(newId)).emit('group:created', { conversation });
  }

  // 2) Existing members get one "someone joined" delta per added user.
  //    Excluding the new members' user rooms avoids a duplicate event
  //    on top of the `group:created` they just received.
  const exclusions = addedUserIds.map((id) => userRoom(id));
  for (const user of addedUsers) {
    if (!user) continue;
    io.to(room).except(exclusions).emit('group:memberAdded', {
      conversationId,
      user,
      byUserId: actor,
    });
  }
};

/**
 * `group:memberRemoved` — a member has left or been kicked. Tear down
 * their room subscription FIRST (so the imminent fan-out doesn't reach
 * them), then notify the rest of the room. The removed user gets a
 * dedicated event on their personal room so the client can drop the
 * conversation from the sidebar.
 */
export const emitGroupMemberRemoved = (
  io,
  { conversationId, userId, byUserId, reason = 'removed' },
) => {
  if (!io || !conversationId || !userId) return;
  const cid = String(conversationId);
  const uid = String(userId);
  const room = convRoom(cid);

  // Order matters: leave the room before broadcasting so the removed
  // user does not hear their own removal twice.
  io.in(userRoom(uid)).socketsLeave(room);

  io.to(room).emit('group:memberRemoved', {
    conversationId: cid,
    userId: uid,
    byUserId: byUserId ? String(byUserId) : null,
  });

  // Direct notice on the removed user's personal room so every device
  // they own can update the sidebar / close the chat window.
  io.to(userRoom(uid)).emit('group:youWereRemoved', {
    conversationId: cid,
    byUserId: byUserId ? String(byUserId) : null,
    reason,
  });
};

/**
 * `group:updated` — name / avatar metadata changed. Only ships the
 * fields that actually moved so clients can do a targeted patch instead
 * of replacing their whole conversation slice. Payload shape matches the
 * spec exactly: `{ conversationId, name?, avatarUrl?, byUserId? }`.
 */
export const emitGroupUpdated = (io, { conversationId, changes, byUserId }) => {
  if (!io || !conversationId || !changes || typeof changes !== 'object') return;
  const payload = {
    conversationId: String(conversationId),
    byUserId: byUserId ? String(byUserId) : null,
  };
  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    payload.name = changes.name;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'avatarUrl')) {
    payload.avatarUrl = changes.avatarUrl;
  }
  io.to(convRoom(conversationId)).emit('group:updated', payload);
};

/**
 * `group:adminChanged` — a member was promoted or demoted. Carries the
 * boolean post-state so clients don't need to remember the previous
 * value.
 */
export const emitGroupAdminChanged = (
  io,
  { conversationId, userId, isAdmin, byUserId },
) => {
  if (!io || !conversationId || !userId) return;
  io.to(convRoom(conversationId)).emit('group:adminChanged', {
    conversationId: String(conversationId),
    userId: String(userId),
    isAdmin: Boolean(isAdmin),
    byUserId: byUserId ? String(byUserId) : null,
  });
};

export default {
  emitGroupCreated,
  emitGroupMemberAdded,
  emitGroupMemberRemoved,
  emitGroupUpdated,
  emitGroupAdminChanged,
};
