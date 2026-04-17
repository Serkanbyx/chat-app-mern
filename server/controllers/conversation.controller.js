import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  findOrCreateDirectConversation,
  assertParticipant,
  assertGroupAdmin,
} from '../utils/conversationService.js';
import {
  createSystemMessage,
  buildSystemMessageText,
  markConversationAsRead,
} from '../utils/messageService.js';
import { parsePagination, buildPageMeta } from '../utils/pagination.js';
import {
  CONVERSATION_TYPES,
  GROUP_MAX_PARTICIPANTS,
  USER_STATUS,
} from '../utils/constants.js';

const { Types } = mongoose;

/**
 * Public projection for any populated participant. We pull
 * `preferences.showOnlineStatus` only to apply the privacy mask in
 * `serializeParticipant` and strip it before sending. Email, password,
 * blockedUsers, full preferences, etc. are NEVER exposed.
 */
const PARTICIPANT_PROJECTION =
  '_id username displayName avatarUrl isOnline lastSeenAt preferences.showOnlineStatus status';

const idEquals = (a, b) => String(a) === String(b);

/**
 * Render a participant object: enforces the per-user `showOnlineStatus`
 * privacy preference server-side and removes the preferences subdoc that
 * was selected only to make the decision.
 */
const serializeParticipant = (rawUser) => {
  if (!rawUser) return null;
  const user =
    typeof rawUser.toObject === 'function'
      ? rawUser.toObject({ virtuals: false, versionKey: false })
      : { ...rawUser };

  const showOnline = user?.preferences?.showOnlineStatus !== false;
  delete user.preferences;

  if (!showOnline) {
    user.isOnline = false;
    user.lastSeenAt = null;
  }
  return user;
};

/**
 * Render a Conversation for a specific viewer:
 *  - converts the unreadCounts Map into a single `unreadCount` scalar for
 *    the viewer (other users' counts are never leaked).
 *  - applies privacy masking on every participant.
 */
const serializeConversation = (conv, viewerId) => {
  if (!conv) return null;
  const obj = conv.toObject({
    virtuals: false,
    versionKey: false,
    flattenMaps: true,
  });

  const viewer = String(viewerId);
  const unreadMap = obj.unreadCounts || {};
  const unreadCount = Number(unreadMap[viewer]) || 0;
  delete obj.unreadCounts;

  obj.unreadCount = unreadCount;
  obj.participants = (obj.participants || []).map(serializeParticipant);
  return obj;
};

const populateAndSerialize = async (conv, viewerId) => {
  await conv.populate({ path: 'participants', select: PARTICIPANT_PROJECTION });
  return serializeConversation(conv, viewerId);
};

/**
 * Block-aware lookup used during direct/group creation. Returns the set
 * of usable target user docs and surfaces a 4xx if any constraint fails.
 */
const loadAndAssertUsable = async (targetIds, requester) => {
  const requesterId = String(requester._id);
  // `blockedUsers` is now `[{ user, blockedAt }]` — extract just the ids
  // for membership checks.
  const requesterBlocks = new Set(
    (requester.blockedUsers || [])
      .map((entry) => entry?.user)
      .filter(Boolean)
      .map((id) => String(id)),
  );

  const users = await User.find({ _id: { $in: targetIds } })
    .select('blockedUsers status')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  for (const id of targetIds) {
    const user = byId.get(String(id));
    if (!user) throw ApiError.badRequest('One or more users do not exist');
    if (user.status !== USER_STATUS.ACTIVE) {
      throw ApiError.badRequest('One or more users are unavailable');
    }
    if (requesterBlocks.has(String(user._id))) {
      throw ApiError.forbidden('You have blocked one of the selected users');
    }
    const theyBlock = (user.blockedUsers || [])
      .map((entry) => String(entry?.user))
      .filter(Boolean);
    if (theyBlock.includes(requesterId)) {
      throw ApiError.forbidden('One of the selected users has blocked you');
    }
  }

  return users;
};

// GET /api/conversations
export const getConversations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });

  // Archive filter (STEP 10): default view excludes archived chats; pass
  // `?archived=true` to see the archived bucket. Validation of the
  // boolean-like query param happens in `validateArchivedQuery`.
  const wantsArchived = req.query.archived === 'true';
  const archivedIds = (req.user.archivedConversations || []).map(
    (id) => new Types.ObjectId(String(id)),
  );

  // Build the bidirectional set of "users I can no longer see in the
  // sidebar": users I blocked + users who blocked me. Direct chats with
  // any of them are hidden from the LIST view (the conversation itself
  // is preserved — re-opening via deep link is allowed and surfaces a
  // banner client-side).
  const blockedByMe = (req.user.blockedUsers || [])
    .map((entry) => entry?.user)
    .filter(Boolean);

  const blockedMeRows = await User.find(
    { 'blockedUsers.user': req.user._id },
    { _id: 1 },
  ).lean();
  const blockedMeIds = blockedMeRows.map((u) => u._id);

  // De-duplicate by hex string before re-materialising as ObjectIds for
  // the query — concatenating the two arrays directly would let a mutual
  // block double-count (and confuses index planners).
  const hiddenUserIds = Array.from(
    new Set([...blockedByMe, ...blockedMeIds].map((id) => String(id))),
  ).map((s) => new Types.ObjectId(s));

  const filter = { participants: req.user._id, isActive: true };
  if (hiddenUserIds.length > 0) {
    filter.$nor = [
      {
        type: CONVERSATION_TYPES.DIRECT,
        participants: { $in: hiddenUserIds },
      },
    ];
  }

  if (wantsArchived) {
    // No archived chats → nothing to return; short-circuit before hitting Mongo.
    if (archivedIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { items: [], ...buildPageMeta({ total: 0, page, limit }) },
      });
    }
    filter._id = { $in: archivedIds };
  } else if (archivedIds.length > 0) {
    filter._id = { $nin: archivedIds };
  }

  const [items, total] = await Promise.all([
    Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'participants', select: PARTICIPANT_PROJECTION }),
    Conversation.countDocuments(filter),
  ]);

  const data = items.map((c) => serializeConversation(c, req.user._id));

  res.status(200).json({
    success: true,
    data: { items: data, ...buildPageMeta({ total, page, limit }) },
  });
});

// POST /api/conversations/direct
export const createDirect = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (idEquals(userId, req.user._id)) {
    throw ApiError.badRequest('Cannot create a direct conversation with yourself');
  }

  await loadAndAssertUsable([userId], req.user);

  const conversation = await findOrCreateDirectConversation(req.user._id, userId);
  const data = await populateAndSerialize(conversation, req.user._id);

  res.status(200).json({ success: true, data });
});

// POST /api/conversations/group
export const createGroup = asyncHandler(async (req, res) => {
  const { name, participantIds, avatarUrl = '' } = req.body;

  // De-duplicate, drop self if accidentally included.
  const requesterId = String(req.user._id);
  const uniqueOthers = Array.from(
    new Set(participantIds.map((id) => String(id))),
  ).filter((id) => id !== requesterId);

  if (uniqueOthers.length === 0) {
    throw ApiError.badRequest('Group requires at least one other participant');
  }
  if (uniqueOthers.length + 1 > GROUP_MAX_PARTICIPANTS) {
    throw ApiError.badRequest(
      `Group cannot exceed ${GROUP_MAX_PARTICIPANTS} participants`,
    );
  }

  await loadAndAssertUsable(uniqueOthers, req.user);

  const participants = [requesterId, ...uniqueOthers];

  const created = await Conversation.create({
    type: CONVERSATION_TYPES.GROUP,
    name: name.trim(),
    avatarUrl: avatarUrl || '',
    participants,
    admins: [requesterId],
    createdBy: requesterId,
  });

  const data = await populateAndSerialize(created, req.user._id);
  res.status(201).json({ success: true, data });
});

// GET /api/conversations/:id
export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).populate({
    path: 'participants',
    select: PARTICIPANT_PROJECTION,
  });
  assertParticipant(conversation, req.user._id);

  res
    .status(200)
    .json({ success: true, data: serializeConversation(conversation, req.user._id) });
});

// PATCH /api/conversations/:id
export const updateConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations can be updated');
  }
  assertGroupAdmin(conversation, req.user._id);

  const ALLOWED = ['name', 'avatarUrl'];
  let touched = false;
  let renamedFrom = null;
  let renamedTo = null;
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      const value = req.body[key];
      if (key === 'name') {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed.length === 0) continue;
        if (trimmed !== conversation.name) {
          renamedFrom = conversation.name;
          renamedTo = trimmed;
        }
        conversation.name = trimmed;
      } else {
        conversation.avatarUrl = typeof value === 'string' ? value : '';
      }
      touched = true;
    }
  }

  if (!touched) {
    throw ApiError.badRequest('No valid fields provided to update');
  }

  await conversation.save();

  // System message must be emitted AFTER the save so the post-save hook
  // sees the new name on the parent doc when refreshing lastMessage.
  if (renamedTo) {
    await createSystemMessage({
      conversationId: conversation._id,
      text: buildSystemMessageText(
        '{actor} renamed the group from "{from}" to "{to}"',
        { actor: req.user.displayName, from: renamedFrom, to: renamedTo },
      ),
    });
  }

  const data = await populateAndSerialize(conversation, req.user._id);
  res.status(200).json({ success: true, data });
});

// POST /api/conversations/:id/members
export const addMembers = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations accept new members');
  }
  assertGroupAdmin(conversation, req.user._id);

  const existing = new Set(conversation.participants.map((p) => String(p)));
  const requestedIds = Array.from(
    new Set(req.body.userIds.map((id) => String(id))),
  ).filter((id) => !existing.has(id));

  if (requestedIds.length === 0) {
    throw ApiError.badRequest('All provided users are already members');
  }

  if (existing.size + requestedIds.length > GROUP_MAX_PARTICIPANTS) {
    throw ApiError.badRequest(
      `Group cannot exceed ${GROUP_MAX_PARTICIPANTS} participants`,
    );
  }

  await loadAndAssertUsable(requestedIds, req.user);

  conversation.participants.push(...requestedIds);
  await conversation.save();

  // System message per added user — readable timeline event for everyone
  // already in the group. Display names are sanitized server-side inside
  // `buildSystemMessageText`.
  const addedDocs = await User.find({ _id: { $in: requestedIds } })
    .select('displayName')
    .lean();
  for (const added of addedDocs) {
    await createSystemMessage({
      conversationId: conversation._id,
      text: buildSystemMessageText('{actor} added {target} to the group', {
        actor: req.user.displayName,
        target: added.displayName,
      }),
    });
  }

  const data = await populateAndSerialize(conversation, req.user._id);
  res.status(200).json({ success: true, data });
});

/**
 * Shared logic for "leave on your own" vs. "kicked by an admin".
 * Returns the conversation document AFTER the side effect.
 *
 * Last-admin handling: if the leaver was the only admin, promote the
 * first remaining participant (insertion order ≈ joinedAt). If no one
 * else remains the group is marked inactive.
 */
const removeParticipant = async ({ conversation, targetId }) => {
  const tid = String(targetId);
  const remaining = conversation.participants
    .map((p) => String(p))
    .filter((id) => id !== tid);

  // Solo leaver → tombstone the group instead of leaving an orphan doc.
  if (remaining.length === 0) {
    return Conversation.findByIdAndUpdate(
      conversation._id,
      {
        $pull: { participants: tid, admins: tid },
        $unset: { [`unreadCounts.${tid}`]: '' },
        $set: { isActive: false },
      },
      { new: true },
    );
  }

  // 1-person residual group is structurally invalid (model requires ≥ 2),
  // so we keep them as participant but flag the group inactive.
  if (remaining.length < 2) {
    return Conversation.findByIdAndUpdate(
      conversation._id,
      {
        $pull: { participants: tid, admins: tid },
        $unset: { [`unreadCounts.${tid}`]: '' },
        $set: { isActive: false },
      },
      { new: true },
    );
  }

  const wasAdmin = conversation.admins.some((a) => String(a) === tid);
  const remainingAdmins = conversation.admins
    .map((a) => String(a))
    .filter((id) => id !== tid);

  const update = {
    $pull: { participants: tid, admins: tid },
    $unset: { [`unreadCounts.${tid}`]: '' },
  };

  // Promote the next-joined participant when we'd otherwise zero the
  // admin list. `remaining[0]` is the earliest-joined remaining user
  // because participants is push-only.
  if (wasAdmin && remainingAdmins.length === 0) {
    update.$addToSet = { admins: remaining[0] };
  }

  return Conversation.findByIdAndUpdate(conversation._id, update, { new: true });
};

// DELETE /api/conversations/:id/members/:userId
export const removeMember = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group memberships can be removed');
  }

  const targetId = req.params.userId;
  const isSelf = idEquals(targetId, req.user._id);

  if (!isSelf) {
    assertGroupAdmin(conversation, req.user._id);
  }

  const targetIsParticipant = conversation.participants.some((p) =>
    idEquals(p, targetId),
  );
  if (!targetIsParticipant) {
    throw ApiError.badRequest('Target user is not a member of this group');
  }

  const updated = await removeParticipant({ conversation, targetId });

  // System message: distinguish self-leave from admin-kick so the timeline
  // reads naturally. Skip emission when the group was tombstoned (the
  // removal left fewer than 2 participants — there's nobody left to read it).
  if (updated?.isActive) {
    if (isSelf) {
      await createSystemMessage({
        conversationId: updated._id,
        text: buildSystemMessageText('{actor} left the group', {
          actor: req.user.displayName,
        }),
      });
    } else {
      const target = await User.findById(targetId).select('displayName').lean();
      await createSystemMessage({
        conversationId: updated._id,
        text: buildSystemMessageText('{actor} removed {target} from the group', {
          actor: req.user.displayName,
          target: target?.displayName,
        }),
      });
    }
  }

  await updated.populate({
    path: 'participants',
    select: PARTICIPANT_PROJECTION,
  });

  res
    .status(200)
    .json({ success: true, data: serializeConversation(updated, req.user._id) });
});

// POST /api/conversations/:id/admins/:userId
export const promoteAdmin = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations have admins');
  }
  assertGroupAdmin(conversation, req.user._id);

  const { userId } = req.params;
  const targetIsParticipant = conversation.participants.some((p) =>
    idEquals(p, userId),
  );
  if (!targetIsParticipant) {
    throw ApiError.badRequest('User is not a member of this group');
  }

  const alreadyAdmin = conversation.admins.some((a) => idEquals(a, userId));
  if (alreadyAdmin) {
    throw ApiError.conflict('User is already an admin');
  }

  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    { $addToSet: { admins: new Types.ObjectId(userId) } },
    { new: true },
  ).populate({ path: 'participants', select: PARTICIPANT_PROJECTION });

  const target = await User.findById(userId).select('displayName').lean();
  await createSystemMessage({
    conversationId: updated._id,
    text: buildSystemMessageText('{actor} promoted {target} to admin', {
      actor: req.user.displayName,
      target: target?.displayName,
    }),
  });

  res
    .status(200)
    .json({ success: true, data: serializeConversation(updated, req.user._id) });
});

// DELETE /api/conversations/:id/admins/:userId
export const demoteAdmin = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest('Only group conversations have admins');
  }
  assertGroupAdmin(conversation, req.user._id);

  const { userId } = req.params;
  const isAdmin = conversation.admins.some((a) => idEquals(a, userId));
  if (!isAdmin) {
    throw ApiError.badRequest('User is not an admin of this group');
  }

  // Last-admin protection (mirrors STEP 6): a group MUST always retain at
  // least one admin. Demoting yourself when you are the sole admin is a
  // foot-gun we close here — the user can leave the group instead, which
  // triggers automatic promotion of the next-joined participant.
  if (conversation.admins.length === 1) {
    throw ApiError.badRequest(
      'Cannot demote the last admin; promote another admin first or leave the group',
    );
  }

  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    { $pull: { admins: new Types.ObjectId(userId) } },
    { new: true },
  ).populate({ path: 'participants', select: PARTICIPANT_PROJECTION });

  const target = await User.findById(userId).select('displayName').lean();
  await createSystemMessage({
    conversationId: updated._id,
    text: buildSystemMessageText('{actor} removed admin from {target}', {
      actor: req.user.displayName,
      target: target?.displayName,
    }),
  });

  res
    .status(200)
    .json({ success: true, data: serializeConversation(updated, req.user._id) });
});

/**
 * Toggle an entry on a user-scoped array (mutedConversations or
 * archivedConversations). Single round-trip, atomic, and decided
 * server-side from the latest DB state — never trust the in-memory copy.
 */
const toggleUserArrayMembership = async ({ user, conversationId, field }) => {
  const cid = new Types.ObjectId(conversationId);
  // Re-read the live array to avoid stale stop-and-think races.
  const fresh = await User.findById(user._id).select(field).lean();
  const current = (fresh?.[field] || []).map((id) => String(id));
  const isMember = current.includes(String(cid));

  const op = isMember
    ? { $pull: { [field]: cid } }
    : { $addToSet: { [field]: cid } };

  await User.updateOne({ _id: user._id }, op);
  return !isMember;
};

// POST /api/conversations/:id/mute
export const toggleMute = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).select(
    'participants',
  );
  assertParticipant(conversation, req.user._id);

  const muted = await toggleUserArrayMembership({
    user: req.user,
    conversationId: req.params.id,
    field: 'mutedConversations',
  });

  res.status(200).json({ success: true, data: { muted } });
});

// POST /api/conversations/:id/archive
export const toggleArchive = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id).select(
    'participants',
  );
  assertParticipant(conversation, req.user._id);

  const archived = await toggleUserArrayMembership({
    user: req.user,
    conversationId: req.params.id,
    field: 'archivedConversations',
  });

  res.status(200).json({ success: true, data: { archived } });
});

// POST /api/conversations/:id/read
export const markRead = asyncHandler(async (req, res) => {
  // Load once for the participant gate AND to know who else needs the
  // socket event later. `markConversationAsRead` does its own membership
  // check too — but we want the snappy 4xx (and to capture participants
  // for the broadcast payload) before touching the message collection.
  const conversation = await Conversation.findById(req.params.id).select(
    'participants type',
  );
  assertParticipant(conversation, req.user._id);

  const result = await markConversationAsRead({
    conversationId: req.params.id,
    userId: req.user._id,
  });

  // Server-side privacy gate: a user with `showReadReceipts: false` may
  // freely reset their OWN unread count, but the rest of the room must
  // never learn that they read the messages. Decided here, not on the
  // client, so flipping the toggle in DevTools is meaningless.
  const broadcast = req.user.preferences?.showReadReceipts !== false;
  const readAt = new Date().toISOString();

  // STEP 15 wires the actual socket emission. The handler will read
  // `broadcast` from this controller's response shape (or recompute it
  // from the user doc) and only emit `conversationRead` when true:
  //   io.to(`conversation:${conversationId}`)
  //     .except(socketIdsFor(req.user._id))
  //     .emit('conversationRead', { conversationId, userId, readAt });

  res.status(200).json({
    success: true,
    data: {
      conversationId: String(conversation._id),
      readAt,
      messagesUpdated: result.modified,
      broadcast,
    },
  });
});

// GET /api/conversations/unread-summary
export const getUnreadSummary = asyncHandler(async (req, res) => {
  // Map<userId, count> is stored as a sub-document in MongoDB, so the
  // dotted path resolves correctly inside aggregation. The user id is a
  // 24-char hex string sourced from the verified JWT — no metacharacters
  // can leak into the field path here.
  const userIdStr = String(req.user._id);
  const unreadPath = `$unreadCounts.${userIdStr}`;

  const rows = await Conversation.aggregate([
    { $match: { participants: req.user._id, isActive: true } },
    {
      $project: {
        _id: 1,
        // `$ifNull` covers brand-new conversations where the map entry
        // does not exist yet; `$convert` defends against accidental
        // string values written by older code paths.
        count: {
          $convert: {
            input: { $ifNull: [unreadPath, 0] },
            to: 'int',
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    { $match: { count: { $gt: 0 } } },
    { $sort: { count: -1, _id: -1 } },
  ]);

  const perConversation = rows.map((row) => ({
    conversationId: String(row._id),
    count: row.count,
  }));
  const total = perConversation.reduce((sum, row) => sum + row.count, 0);

  res.status(200).json({
    success: true,
    data: { total, perConversation },
  });
});

// DELETE /api/conversations/:id
export const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  assertParticipant(conversation, req.user._id);

  if (conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw ApiError.badRequest(
      'Direct conversations cannot be deleted; archive instead',
    );
  }

  const updated = await removeParticipant({
    conversation,
    targetId: req.user._id,
  });

  // Only emit a "left the group" system event when there's actually a
  // group left to read it. Tombstoned (isActive: false) groups skip it.
  if (updated?.isActive) {
    await createSystemMessage({
      conversationId: updated._id,
      text: buildSystemMessageText('{actor} left the group', {
        actor: req.user.displayName,
      }),
    });
  }

  res.status(200).json({
    success: true,
    message: updated?.isActive ? 'Left conversation' : 'Conversation closed',
  });
});
