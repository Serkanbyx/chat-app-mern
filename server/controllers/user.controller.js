import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { USER_STATUS } from '../utils/constants.js';

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

// GET /api/users/search?q=...
export const searchUsers = asyncHandler(async (req, res) => {
  const raw = String(req.query.q ?? '').trim();
  // Defence-in-depth: validator already enforced length, but escapeRegex
  // is what neutralises ReDoS. Anchored prefix match keeps Mongo on the
  // username/displayName indexes when present.
  const pattern = new RegExp(`^${escapeRegex(raw)}`, 'i');

  const users = await User.find({
    status: USER_STATUS.ACTIVE,
    _id: { $ne: req.user._id, $nin: req.user.blockedUsers ?? [] },
    // Symmetric block check: don't surface users who have blocked the viewer.
    blockedUsers: { $ne: req.user._id },
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
    (id) => String(id) === String(user._id),
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
      path: 'blockedUsers',
      select: '_id username displayName avatarUrl',
      // Hide users who have since deleted their account from the list.
      match: { status: { $ne: USER_STATUS.DELETED } },
    })
    .select('blockedUsers')
    .lean();

  const blocked = (me?.blockedUsers ?? []).filter(Boolean);

  res.status(200).json({
    success: true,
    data: { users: blocked, count: blocked.length },
  });
});
