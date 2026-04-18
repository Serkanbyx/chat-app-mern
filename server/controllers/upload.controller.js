import { streamUpload, safeDestroy } from '../config/cloudinary.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const AVATAR_FOLDER = 'chat-app/avatars';
const MESSAGE_FOLDER = 'chat-app/messages';

// POST /api/upload/avatar
export const uploadAvatarController = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    throw ApiError.badRequest('Image file is required (field name "image")');
  }

  const previousPublicId = req.user.avatarPublicId;

  const { url, publicId } = await streamUpload(req.file.buffer, AVATAR_FOLDER);

  // Persist BEFORE destroying the old asset — if the DB write fails we
  // still own the new asset and can retry, instead of leaving the user
  // with a broken avatar reference.
  await User.updateOne(
    { _id: req.user._id },
    { $set: { avatarUrl: url, avatarPublicId: publicId } },
  );

  if (previousPublicId && previousPublicId !== publicId) {
    safeDestroy(previousPublicId);
  }

  res.status(201).json({
    success: true,
    message: 'Avatar uploaded',
    data: { url, publicId },
  });
});

// DELETE /api/upload/avatar
//
// Removes the caller's avatar — clears `avatarUrl` / `avatarPublicId`
// on the user document AND destroys the Cloudinary asset so we don't
// leak orphaned blobs. Idempotent: a user with no avatar gets a 200
// with `removed: false` instead of a confusing error.
export const deleteAvatarController = asyncHandler(async (req, res) => {
  const previousPublicId = req.user.avatarPublicId;
  const hadAvatar = Boolean(req.user.avatarUrl || previousPublicId);

  if (!hadAvatar) {
    return res.status(200).json({
      success: true,
      message: 'No avatar to remove',
      data: { removed: false },
    });
  }

  await User.updateOne(
    { _id: req.user._id },
    { $set: { avatarUrl: '', avatarPublicId: '' } },
  );

  if (previousPublicId) {
    safeDestroy(previousPublicId);
  }

  return res.status(200).json({
    success: true,
    message: 'Avatar removed',
    data: { removed: true },
  });
});

// POST /api/upload/message-image
export const uploadMessageImageController = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    throw ApiError.badRequest('Image file is required (field name "image")');
  }

  // We deliberately DO NOT create a Message here. The client follows up
  // with POST /api/messages or a Socket.io emit, supplying the imageUrl /
  // imagePublicId returned below. This decouples the heavy upload from
  // the lightweight send and lets the client cancel sends after upload.
  const { url, publicId } = await streamUpload(req.file.buffer, MESSAGE_FOLDER);

  res.status(201).json({
    success: true,
    message: 'Image uploaded',
    data: { url, publicId },
  });
});
