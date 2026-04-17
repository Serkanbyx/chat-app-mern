import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateToken } from '../utils/generateToken.js';
import { ROLES, USER_STATUS, DELETED_USER_LABEL } from '../utils/constants.js';

/**
 * Strip the password (and any future internal fields) before sending the
 * user document to the client. Single source of truth for user serialization.
 */
const sanitizeUser = (userDoc) => {
  const obj = userDoc.toObject({ virtuals: true, versionKey: false });
  delete obj.password;
  return obj;
};

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  // Explicit destructure — never spread req.body to block mass assignment.
  const { username, email, password, displayName } = req.body;

  // Surface uniqueness conflict with a clean 409 instead of relying on the
  // race-prone duplicate-key error from Mongo.
  const conflict = await User.findOne({ $or: [{ email }, { username }] }).lean();
  if (conflict) {
    throw ApiError.conflict('Email or username is already in use');
  }

  const user = await User.create({
    username,
    email,
    password,
    displayName,
    role: ROLES.USER, // Hard-coded — never trust client-provided role.
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    message: 'Account created',
    data: { user: sanitizeUser(user), token },
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Identical error for "no such user" and "bad password" — kills enumeration.
  const user = await User.findOne({ email }).select('+password');
  const passwordOk = user ? await user.comparePassword(password) : false;

  if (!user || !passwordOk) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw ApiError.forbidden('Account is suspended');
  }
  if (user.status === USER_STATUS.DELETED) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    message: 'Logged in',
    data: { user: sanitizeUser(user), token },
  });
});

// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: sanitizeUser(req.user) },
  });
});

// PATCH /api/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
  // Whitelist explicitly — anything not in this list is silently dropped.
  const ALLOWED = ['displayName', 'bio', 'avatarUrl', 'avatarPublicId'];
  const updates = {};
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid fields provided to update');
  }

  Object.assign(req.user, updates);
  await req.user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated',
    data: { user: sanitizeUser(req.user) },
  });
});

// PATCH /api/auth/password
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Re-load with `+password` because protect() strips it by default.
  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw ApiError.unauthorized('User no longer exists');

  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  user.password = newPassword; // pre('save') hook hashes it.
  await user.save();

  res.status(200).json({ success: true, message: 'Password changed' });
});

/**
 * Cascade cleanup for a soft-deleted user. Models that aren't loaded yet
 * (Conversation, Message — added in later STEPS) are skipped gracefully so
 * this STEP runs in isolation. Each side-effect runs in parallel.
 */
const cascadeUserDeletion = async (userId) => {
  const tasks = [];

  // Remove from other users' blockedUsers arrays.
  tasks.push(
    User.updateMany(
      { blockedUsers: userId },
      { $pull: { blockedUsers: userId } },
    ),
  );

  if (mongoose.models.Conversation) {
    const Conversation = mongoose.models.Conversation;
    tasks.push(
      Conversation.updateMany(
        { participants: userId },
        { $pull: { participants: userId, admins: userId } },
      ),
    );
  }

  if (mongoose.models.Message) {
    const Message = mongoose.models.Message;
    // Anonymize — keep the message body so chat history stays coherent.
    tasks.push(Message.updateMany({ sender: userId }, { $set: { sender: null } }));
  }

  await Promise.all(tasks);
};

// DELETE /api/auth/account
export const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw ApiError.unauthorized('User no longer exists');

  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Password confirmation failed');

  // Redact PII while keeping the document so foreign keys stay valid.
  const tombstoneId = user._id.toString().slice(-6);
  user.status = USER_STATUS.DELETED;
  user.email = `deleted_${tombstoneId}@deleted.local`;
  user.username = `deleted_${tombstoneId}`;
  user.displayName = DELETED_USER_LABEL;
  user.bio = '';
  user.avatarUrl = '';
  user.avatarPublicId = '';
  user.isOnline = false;
  user.blockedUsers = [];
  user.mutedConversations = [];
  user.archivedConversations = [];
  await user.save({ validateBeforeSave: false });

  await cascadeUserDeletion(user._id);

  res.status(200).json({ success: true, message: 'Account deleted' });
});
