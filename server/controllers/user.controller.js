import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { ROLES, USER_STATUS } from '../utils/constants.js';

const SEARCH_RESULT_LIMIT = 20;

/**
 * Whitelist of preference dot-paths the client may write. Anything not in
 * this map is silently dropped — adding a new field requires a code
 * change in BOTH the validator and this whitelist (intentional).
 */
const PREFERENCE_PATHS = Object.freeze([
  'theme',
  'fontSize',
  'contentDensity',
  'animations',
  'enterToSend',
  'showReadReceipts',
  'showOnlineStatus',
  'notifications.browser',
  'notifications.sound',
  'notifications.muteAll',
]);

/**
 * Walk a dotted path through a plain object. Returns `undefined` when any
 * segment is missing instead of throwing — caller treats it as "not set".
 */
const getByPath = (obj, path) => {
  if (!obj) return undefined;
  return path.split('.').reduce(
    (acc, key) => (acc == null ? undefined : acc[key]),
    obj,
  );
};

/** Public projection: minimal, no PII, no internal fields. */
const PUBLIC_USER_PROJECTION =
  '_id username displayName avatarUrl bio isOnline lastSeenAt createdAt preferences.showOnlineStatus';

/**
 * Apply per-user `showOnlineStatus` privacy mask and strip the
 * preferences subdoc that we only loaded to make the decision. Mutates +
 * returns a plain object.
 */
const maskPresence = (user) => {
  if (!user) return null;
  const showOnline = user?.preferences?.showOnlineStatus !== false;
  delete user.preferences;
  if (!showOnline) {
    user.isOnline = false;
    user.lastSeenAt = null;
  }
  return user;
};

/**
 * Extract the bare ObjectId list from `user.blockedUsers` regardless of
 * whether it was loaded as Mongoose subdocs or plain objects.
 */
const extractBlockedIds = (blockedUsers) =>
  (blockedUsers ?? [])
    .map((entry) => entry?.user)
    .filter(Boolean);

// GET /api/users/search?q=...
export const searchUsers = asyncHandler(async (req, res) => {
  const raw = String(req.query.q ?? '').trim();
  // Defence-in-depth: validator already enforced length, but escapeRegex
  // is what neutralises ReDoS. Anchored prefix match keeps Mongo on the
  // username/displayName indexes when present.
  const pattern = new RegExp(`^${escapeRegex(raw)}`, 'i');

  const blockedIds = extractBlockedIds(req.user.blockedUsers);

  const users = await User.find({
    status: USER_STATUS.ACTIVE,
    _id: { $ne: req.user._id, $nin: blockedIds },
    // Symmetric block check: don't surface users who have blocked the viewer.
    'blockedUsers.user': { $ne: req.user._id },
    $or: [{ username: pattern }, { displayName: pattern }],
  })
    .select('_id username displayName avatarUrl isOnline preferences.showOnlineStatus')
    .limit(SEARCH_RESULT_LIMIT)
    .lean();

  const data = users.map((u) => {
    const showOnline = u?.preferences?.showOnlineStatus !== false;
    return {
      _id: u._id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl ?? '',
      isOnline: showOnline ? Boolean(u.isOnline) : false,
    };
  });

  res.status(200).json({
    success: true,
    data: { users: data, count: data.length },
  });
});

// GET /api/users/:username
export const getPublicProfile = asyncHandler(async (req, res) => {
  const username = String(req.params.username ?? '').toLowerCase();

  const user = await User.findOne({
    username,
    status: USER_STATUS.ACTIVE,
  })
    .select(PUBLIC_USER_PROJECTION)
    .lean();

  if (!user) throw ApiError.notFound('User not found');

  const isSelf = String(user._id) === String(req.user._id);
  const viewerBlockedTarget = (req.user.blockedUsers ?? []).some(
    (entry) => String(entry?.user) === String(user._id),
  );

  // We never expose whether the target has blocked the viewer (would leak
  // information). For non-self viewers we always strip the privacy
  // subdoc and apply the presence mask.
  const masked = maskPresence({ ...user });

  res.status(200).json({
    success: true,
    data: {
      user: masked,
      relationship: {
        isSelf,
        isBlockedByMe: viewerBlockedTarget,
      },
    },
  });
});

// PATCH /api/users/me/preferences
export const updatePreferences = asyncHandler(async (req, res) => {
  const $set = {};

  for (const path of PREFERENCE_PATHS) {
    const value = getByPath(req.body, path);
    if (value === undefined) continue;
    $set[`preferences.${path}`] = value;
  }

  if (Object.keys($set).length === 0) {
    throw ApiError.badRequest('No valid preference fields provided');
  }

  // runValidators ensures enums on theme/fontSize/contentDensity still
  // apply at the dotted-path level.
  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $set },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw ApiError.unauthorized('User no longer exists');

  res.status(200).json({
    success: true,
    message: 'Preferences updated',
    data: { preferences: updated.preferences },
  });
});

// GET /api/users/me/blocked
export const getBlockedUsers = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user._id)
    .populate({
      path: 'blockedUsers.user',
      select: '_id username displayName avatarUrl',
      // Hide users who have since deleted their account from the list.
      match: { status: { $ne: USER_STATUS.DELETED } },
    })
    .select('blockedUsers')
    .lean();

  // Drop entries whose populated user was filtered out (deleted).
  const blocked = (me?.blockedUsers ?? [])
    .filter((entry) => entry?.user)
    .map((entry) => ({
      ...entry.user,
      blockedAt: entry.blockedAt,
    }));

  res.status(200).json({
    success: true,
    data: { users: blocked, count: blocked.length },
  });
});

/**
 * Resolve and validate a block target. Centralises the "you can't block
 * X" rules so both block / unblock controllers fail fast and consistently
 * BEFORE touching the DB.
 */
const loadBlockTarget = async ({ requesterId, targetId }) => {
  if (String(requesterId) === String(targetId)) {
    throw ApiError.badRequest('You cannot block yourself');
  }
  const target = await User.findById(targetId).select('role status').lean();
  if (!target) throw ApiError.notFound('User not found');
  if (target.status !== USER_STATUS.ACTIVE) {
    throw ApiError.badRequest('User is not available');
  }
  // Admins are exempt from being blocked so moderation actions cannot
  // be silenced. Self-protection at controller level — never trust the UI.
  if (target.role === ROLES.ADMIN) {
    throw ApiError.forbidden('Admins cannot be blocked');
  }
  return target;
};

// POST /api/users/:userId/block
export const blockUser = asyncHandler(async (req, res) => {
  const { userId: targetId } = req.params;

  await loadBlockTarget({
    requesterId: req.user._id,
    targetId,
  });

  // Atomic conditional push: only insert when the target is NOT already
  // present, preventing duplicate subdocs and stale `blockedAt` overwrites.
  // `$addToSet` would not work here because subdocuments differ by their
  // `blockedAt` timestamp on every call.
  const result = await User.updateOne(
    { _id: req.user._id, 'blockedUsers.user': { $ne: targetId } },
    { $push: { blockedUsers: { user: targetId, blockedAt: new Date() } } },
  );

  const alreadyBlocked = result.modifiedCount === 0;

  // TODO (STEP 14/15): emit `userBlocked` to both clients via Socket.io
  // so the conversation panel and any open profile views update in
  // real time and the active relay between the two sockets is severed.

  res.status(alreadyBlocked ? 200 : 201).json({
    success: true,
    message: alreadyBlocked ? 'User was already blocked' : 'User blocked',
    data: { userId: targetId, alreadyBlocked },
  });
});

// DELETE /api/users/:userId/block
export const unblockUser = asyncHandler(async (req, res) => {
  const { userId: targetId } = req.params;

  if (String(req.user._id) === String(targetId)) {
    throw ApiError.badRequest('You cannot unblock yourself');
  }

  const result = await User.updateOne(
    { _id: req.user._id },
    { $pull: { blockedUsers: { user: targetId } } },
  );

  // Idempotent — returning 200 with a flag is friendlier to clients
  // than 404 when the user wasn't blocked in the first place.
  const wasBlocked = result.modifiedCount > 0;

  // TODO (STEP 14/15): emit `userUnblocked` so both UIs can re-enable
  // composer / restore presence indicators in real time.

  res.status(200).json({
    success: true,
    message: wasBlocked ? 'User unblocked' : 'User was not blocked',
    data: { userId: targetId, wasBlocked },
  });
});
