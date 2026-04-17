import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { parsePagination, buildPageMeta } from '../utils/pagination.js';
import { safeDestroy } from '../config/cloudinary.js';
import { userRoom } from '../sockets/rooms.js';
import { broadcastDeletedMessage } from '../sockets/message.socket.js';
import { writeAuditLog } from '../utils/adminAudit.js';
import {
  listReports as listReportsService,
  getReportDetail as getReportDetailService,
  reviewReport as reviewReportService,
} from '../utils/reportService.js';
import { serializeMessage } from '../utils/serializers.js';
import {
  ROLES,
  USER_STATUS,
  CONVERSATION_TYPES,
  MESSAGE_DELETED_FOR,
  ADMIN_AUDIT_ACTIONS,
  REPORT_TARGET_TYPES,
} from '../utils/constants.js';

/**
 * Public projection for the user list / detail endpoints. Email and
 * timestamps are useful to admins (audit trail, support workflows) but
 * password and big preference subdocs stay out — admin views consume
 * the same wire shape regardless of the requester role to keep
 * snapshot tests stable.
 */
const ADMIN_USER_PROJECTION =
  '_id username email displayName avatarUrl avatarPublicId bio role status isOnline lastSeenAt createdAt updatedAt';

/** Equality helper that tolerates ObjectId / string mixes. */
const idEquals = (a, b) => String(a) === String(b);

/**
 * Force-disconnect every live socket for a given user. Called on the
 * suspend path so a revoked account cannot keep an open WebSocket
 * pumping events. The room name MUST come from `userRoom()` so we
 * never drift between emitter and joiner conventions.
 */
const forceDisconnectUser = (req, userId) => {
  const io = req.app.get('io');
  if (!io) return;
  try {
    io.in(userRoom(userId)).disconnectSockets(true);
  } catch (err) {
    console.error('[admin] force-disconnect failed:', err);
  }
};

/**
 * Cascade for an admin hard-delete:
 *   - Pull the user from every conversation (participants + admins).
 *   - Pull from every other user's `blockedUsers` subdoc list.
 *   - Anonymize the user's messages (set sender → null) so chat
 *     history stays coherent for the rest of the participants.
 *   - Delete every notification where the user is recipient or actor.
 *   - Best-effort destroy of the Cloudinary avatar (billing cleanup).
 *
 * Mute / archive lists on OTHER users are conversation-id arrays, so
 * deleting a user does not require touching them. They naturally clean
 * up next time the conversation panel resolves stale ids.
 */
const cascadeAdminDelete = async (user) => {
  const userId = user._id;

  await Promise.all([
    Conversation.updateMany(
      { participants: userId },
      { $pull: { participants: userId, admins: userId } },
    ),
    User.updateMany(
      { 'blockedUsers.user': userId },
      { $pull: { blockedUsers: { user: userId } } },
    ),
    Message.updateMany({ sender: userId }, { $set: { sender: null } }),
    Notification.deleteMany({
      $or: [{ recipient: userId }, { actor: userId }],
    }),
    user.avatarPublicId ? safeDestroy(user.avatarPublicId) : Promise.resolve(),
  ]);
};

// GET /api/admin/stats
export const getStats = asyncHandler(async (_req, res) => {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // `pendingReports` is wrapped in a defensive check because the
  // Report model lands in STEP 18; until then it is unregistered and
  // the stats card simply shows zero. Once the model is loaded the
  // counter starts populating with no further wiring.
  const ReportModel = mongoose.models.Report ?? null;

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    totalConversations,
    totalGroups,
    messagesLast24h,
    messagesLast7d,
    pendingReports,
  ] = await Promise.all([
    User.countDocuments({ status: { $ne: USER_STATUS.DELETED } }),
    User.countDocuments({
      status: USER_STATUS.ACTIVE,
      lastSeenAt: { $gte: last24h },
    }),
    User.countDocuments({ status: USER_STATUS.SUSPENDED }),
    Conversation.countDocuments({ isActive: true }),
    Conversation.countDocuments({
      type: CONVERSATION_TYPES.GROUP,
      isActive: true,
    }),
    Message.countDocuments({ createdAt: { $gte: last24h } }),
    Message.countDocuments({ createdAt: { $gte: last7d } }),
    ReportModel
      ? ReportModel.countDocuments({ status: 'pending' }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalConversations,
      totalGroups,
      messagesLast24h,
      messagesLast7d,
      pendingReports,
    },
  });
});

// GET /api/admin/users
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.role) filter.role = req.query.role;

  const rawQ = String(req.query.q ?? '').trim();
  if (rawQ) {
    // ReDoS-safe: every metachar in the user-supplied value is escaped
    // BEFORE composition so the resulting RegExp can only match the
    // literal text the admin typed.
    const pattern = new RegExp(escapeRegex(rawQ), 'i');
    filter.$or = [
      { username: pattern },
      { email: pattern },
      { displayName: pattern },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select(ADMIN_USER_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users: items,
      ...buildPageMeta({ total, page, limit }),
    },
  });
});

// GET /api/admin/users/:id
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select(ADMIN_USER_PROJECTION)
    .lean();

  if (!user) throw ApiError.notFound('User not found');

  res.status(200).json({
    success: true,
    data: { user },
  });
});

// PATCH /api/admin/users/:id/status
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (idEquals(id, req.user._id)) {
    throw ApiError.forbidden('You cannot change your own status');
  }

  const target = await User.findById(id).select('role status');
  if (!target) throw ApiError.notFound('User not found');

  // Admin-on-admin moderation is intentionally locked off: lifting an
  // admin's account requires direct DB intervention. This prevents one
  // compromised admin from silencing the rest of the moderation team.
  if (target.role === ROLES.ADMIN) {
    throw ApiError.forbidden('Admin accounts cannot be moderated via this endpoint');
  }

  if (target.status === status) {
    return res.status(200).json({
      success: true,
      message: 'User status unchanged',
      data: { id, status: target.status },
    });
  }

  const previousStatus = target.status;
  target.status = status;
  await target.save({ validateBeforeSave: false });

  // Suspended accounts must lose every live socket immediately —
  // otherwise an in-flight WebSocket connection would keep delivering
  // events long after the REST surface has been revoked.
  if (status === USER_STATUS.SUSPENDED) {
    forceDisconnectUser(req, id);
  }

  // Fire-and-forget audit trail (errors are swallowed inside the
  // helper). Recorded with the SAME action enum regardless of which
  // direction the toggle went so forensic queries can group reliably.
  writeAuditLog({
    adminId: req.user._id,
    action:
      status === USER_STATUS.SUSPENDED
        ? ADMIN_AUDIT_ACTIONS.USER_SUSPEND
        : ADMIN_AUDIT_ACTIONS.USER_REINSTATE,
    targetType: 'user',
    targetId: id,
    meta: { previousStatus, newStatus: target.status },
  });

  res.status(200).json({
    success: true,
    message: `User ${status === USER_STATUS.SUSPENDED ? 'suspended' : 'reinstated'}`,
    data: { id, status: target.status },
  });
});

// PATCH /api/admin/users/:id/role
export const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (idEquals(id, req.user._id)) {
    throw ApiError.forbidden('You cannot change your own role');
  }

  const target = await User.findById(id).select('role status');
  if (!target) throw ApiError.notFound('User not found');

  if (target.status === USER_STATUS.DELETED) {
    throw ApiError.badRequest('Cannot change role of a deleted account');
  }

  if (target.role === role) {
    return res.status(200).json({
      success: true,
      message: 'User role unchanged',
      data: { id, role: target.role },
    });
  }

  // Last-admin protection: demoting the only remaining admin would
  // lock the platform out of every admin-only path. Counted BEFORE
  // mutating so the check stays atomic at the read layer (race
  // window: two parallel demotes of two different admins where each
  // sees the other still admin — acceptable in practice, the next
  // request blocks the second one).
  if (target.role === ROLES.ADMIN && role === ROLES.USER) {
    const remainingAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: { $ne: USER_STATUS.DELETED },
      _id: { $ne: id },
    });
    if (remainingAdmins < 1) {
      throw ApiError.forbidden('At least one admin must remain');
    }
  }

  const previousRole = target.role;
  target.role = role;
  await target.save({ validateBeforeSave: false });

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.USER_ROLE_CHANGE,
    targetType: 'user',
    targetId: id,
    meta: { previousRole, newRole: target.role },
  });

  res.status(200).json({
    success: true,
    message: `User role updated to ${target.role}`,
    data: { id, role: target.role },
  });
});

// DELETE /api/admin/users/:id
export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (idEquals(id, req.user._id)) {
    throw ApiError.forbidden('You cannot delete your own account from the admin panel');
  }

  const target = await User.findById(id).select(
    'role status avatarPublicId',
  );
  if (!target) throw ApiError.notFound('User not found');

  // Last-admin protection mirrors the role-demote guard so the
  // platform can never end up with zero admins via either path.
  if (target.role === ROLES.ADMIN) {
    const remainingAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: { $ne: USER_STATUS.DELETED },
      _id: { $ne: id },
    });
    if (remainingAdmins < 1) {
      throw ApiError.forbidden('At least one admin must remain');
    }
  }

  // Drop every live socket FIRST so cascade work cannot race with
  // events the deleted user's still-connected tabs would otherwise
  // try to emit.
  forceDisconnectUser(req, id);

  await cascadeAdminDelete(target);
  await target.deleteOne();

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.USER_DELETE,
    targetType: 'user',
    targetId: id,
    meta: {
      previousRole: target.role,
      previousStatus: target.status,
      hadAvatar: Boolean(target.avatarPublicId),
    },
  });

  res.status(200).json({
    success: true,
    message: 'User deleted',
    data: { id },
  });
});

/* -------------------- STEP 18 — Reports & moderation -------------------- */

// GET /api/admin/reports
export const listReports = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });

  const status = req.query.status ? String(req.query.status) : null;
  const targetType = req.query.targetType ? String(req.query.targetType) : null;

  const result = await listReportsService({ page, limit, status, targetType });

  res.status(200).json({
    success: true,
    data: {
      reports: result.items,
      ...buildPageMeta({ total: result.total, page, limit }),
    },
  });
});

// GET /api/admin/reports/:id
export const getReport = asyncHandler(async (req, res) => {
  const { report, target } = await getReportDetailService({
    reportId: req.params.id,
  });

  res.status(200).json({
    success: true,
    data: { report, target },
  });
});

// PATCH /api/admin/reports/:id
export const reviewReport = asyncHandler(async (req, res) => {
  const { status, reviewNote = '' } = req.body;

  const updated = await reviewReportService({
    reportId: req.params.id,
    reviewerId: req.user._id,
    status,
    reviewNote,
  });

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.REPORT_REVIEW,
    targetType: 'report',
    targetId: updated._id,
    meta: {
      newStatus: updated.status,
      reportTargetType: updated.targetType,
      reportTargetId: String(updated.targetId),
      hasNote: Boolean(updated.reviewNote),
    },
  });

  res.status(200).json({
    success: true,
    message: 'Report updated',
    data: { report: updated },
  });
});

// DELETE /api/admin/messages/:id
//
// Force-delete-for-everyone: bypasses the sender's edit/delete time
// window AND the sender-only rule, but still routes through the same
// `message:deleted` socket event so every participant's UI redacts the
// bubble in real time. The Cloudinary asset (if any) is destroyed
// fire-and-forget so the response is not blocked on a third-party RTT.
export const forceDeleteMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const message = await Message.findById(id);
  if (!message) throw ApiError.notFound('Message not found');

  if (message.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    return res.status(200).json({
      success: true,
      message: 'Message was already deleted',
      data: { id, conversationId: String(message.conversationId) },
    });
  }

  const previousImagePublicId = message.imagePublicId || '';
  const previousType = message.type;
  const previousSenderId = message.sender ? String(message.sender) : null;
  const conversationId = String(message.conversationId);

  // The pre-save hook in Message.js clears `text` / `imageUrl` when
  // `deletedFor === 'everyone'`. We mirror the field cleanup here so
  // subsequent reads can never replay the original Cloudinary id.
  message.deletedFor = MESSAGE_DELETED_FOR.EVERYONE;
  message.imagePublicId = '';
  await message.save();

  const io = req.app.get('io');
  if (io) {
    broadcastDeletedMessage(io, {
      conversationId,
      messageId: id,
      scope: 'everyone',
    });
  }

  if (previousImagePublicId) {
    safeDestroy(previousImagePublicId);
  }

  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.MESSAGE_FORCE_DELETE,
    targetType: 'message',
    targetId: id,
    meta: {
      conversationId,
      previousType,
      previousSenderId,
      hadImage: Boolean(previousImagePublicId),
    },
  });

  res.status(200).json({
    success: true,
    message: 'Message force-deleted',
    data: { id, conversationId },
  });
});

// GET /api/admin/conversations/:id/messages
//
// Read-only audit window into any conversation, regardless of the
// admin's participation. Every successful access is appended to
// `AdminAuditLog` so admin-on-admin oversight is possible via direct DB
// inspection — a moderator who shoulder-surfs private chats leaves a
// trail. We deliberately DO NOT apply the per-user `hiddenFor`
// tombstones here: the audit view shows the conversation's true state.
export const adminGetConversationMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const conversation = await Conversation.findById(id)
    .select('_id type name participants')
    .lean();
  if (!conversation) throw ApiError.notFound('Conversation not found');

  const { page, limit, skip } = parsePagination(req.query, {
    defaultLimit: 30,
    maxLimit: 50,
  });

  const filter = { conversationId: id };

  const [items, total] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'sender', select: '_id username displayName avatarUrl' })
      .lean(),
    Message.countDocuments(filter),
  ]);

  // Audit AFTER the query succeeded so we never log a phantom access
  // for a conversation that didn't exist or threw mid-read.
  writeAuditLog({
    adminId: req.user._id,
    action: ADMIN_AUDIT_ACTIONS.CONVERSATION_VIEW,
    targetType: 'conversation',
    targetId: conversation._id,
    meta: {
      conversationType: conversation.type,
      participantCount: conversation.participants?.length ?? 0,
      page,
      limit,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      conversation: {
        _id: String(conversation._id),
        type: conversation.type,
        name: conversation.name || '',
        participantCount: conversation.participants?.length ?? 0,
      },
      // Reverse to chronological order so admins read the audit feed
      // top-to-bottom the same way a normal user would.
      items: items.reverse().map((m) => serializeMessage(m)),
      ...buildPageMeta({ total, page, limit }),
    },
  });
});

// Re-exported for tests; not part of the wire surface.
export const _adminInternals = {
  REPORT_TARGET_TYPES,
  ADMIN_AUDIT_ACTIONS,
};
