import { cloudinary, streamUpload } from '../config/cloudinary.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const AVATAR_FOLDER = 'chat-app/avatars';
const MESSAGE_FOLDER = 'chat-app/messages';

/**
 * Best-effort destruction of a previous Cloudinary asset. We log and
 * swallow failures because a billing-side cleanup error must NEVER break
 * the user-facing flow that already succeeded.
 */
const safeDestroy = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (error) {
    console.warn(`[upload] failed to destroy ${publicId}:`, error?.message);
  }
};

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
