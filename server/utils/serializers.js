/**
 * Wire-format helpers shared between the REST and WebSocket layers.
 *
 * Centralised here so the same exact projection ships to clients no
 * matter which transport delivered it. Drift between two serializers
 * (REST returning `hiddenFor`, WebSocket returning everything) would
 * silently leak server-internal fields and create asymmetric UIs.
 */

/**
 * Public sender shape exposed to clients on every message payload.
 * Mirrors the projection used inside `messageService.js`.
 */
export const PUBLIC_SENDER_PROJECTION = '_id username displayName avatarUrl';

/**
 * Convert a Mongoose Message doc (or plain object) into the wire shape
 * the client expects. Strips server-side bookkeeping — `hiddenFor` is
 * used for "delete for self" tombstones and must NEVER be sent (it
 * would leak the list of users who hid a given message).
 *
 * Optional `extras` are merged into the result so the socket layer can
 * tack on `clientTempId` (for optimistic-UI reconciliation) without a
 * second pass over the object.
 */
export const serializeMessage = (doc, extras = null) => {
  if (!doc) return null;
  const obj =
    typeof doc.toObject === 'function'
      ? doc.toObject({ virtuals: false, versionKey: false })
      : { ...doc };
  delete obj.hiddenFor;
  if (extras && typeof extras === 'object') {
    Object.assign(obj, extras);
  }
  return obj;
};

/**
 * Public user shape used inside `notification:new` payloads. Avatar +
 * displayName + username is everything the client needs to render the
 * notification card; email/role/status/preferences MUST stay private.
 */
export const serializePublicUser = (user) => {
  if (!user) return null;
  const obj =
    typeof user.toObject === 'function'
      ? user.toObject({ virtuals: false, versionKey: false })
      : { ...user };
  return {
    _id: String(obj._id),
    username: obj.username,
    displayName: obj.displayName,
    avatarUrl: obj.avatarUrl ?? '',
  };
};

/**
 * Public notification shape exposed on REST + WebSocket payloads.
 *
 * The caller may pass a Mongoose document or a `lean()`-ed plain
 * object — we normalise both to a shallow plain object first. The
 * `actor` field can come back as an ObjectId (lean, no populate) OR a
 * populated user subdocument; `serializePublicUser` handles both.
 *
 * Server-internal fields (`__v`, anything that might leak the schema
 * shape) are omitted by selecting an explicit allow-list rather than
 * stripping a deny-list — newer schema fields cannot accidentally leak.
 */
export const serializeNotification = (doc) => {
  if (!doc) return null;
  const obj =
    typeof doc.toObject === 'function'
      ? doc.toObject({ virtuals: false, versionKey: false })
      : { ...doc };

  // Resolve `actor`: populated → public user shape; bare ObjectId → null
  // for the embedded copy and the raw id stays available on `actorId`.
  let actor = null;
  let actorId = null;
  if (obj.actor && typeof obj.actor === 'object' && obj.actor._id) {
    actor = serializePublicUser(obj.actor);
    actorId = String(obj.actor._id);
  } else if (obj.actor) {
    actorId = String(obj.actor);
  }

  return {
    _id: String(obj._id),
    type: obj.type,
    text: obj.text,
    isRead: Boolean(obj.isRead),
    conversationId: obj.conversationId ? String(obj.conversationId) : null,
    messageId: obj.messageId ? String(obj.messageId) : null,
    actor,
    actorId,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

export default {
  serializeMessage,
  serializePublicUser,
  serializeNotification,
  PUBLIC_SENDER_PROJECTION,
};
