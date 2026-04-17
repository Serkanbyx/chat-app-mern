import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  ROLES,
  USER_STATUS,
  THEME,
  FONT_SIZE,
  CONTENT_DENSITY,
  USERNAME_REGEX,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  BIO_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

// RFC 5322-lite email shape — strict enough to catch typos, loose enough
// to avoid the catastrophic-backtracking patterns floating around the web.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const preferencesSchema = new Schema(
  {
    theme: { type: String, enum: THEME, default: 'system' },
    fontSize: { type: String, enum: FONT_SIZE, default: 'md' },
    contentDensity: { type: String, enum: CONTENT_DENSITY, default: 'comfortable' },
    animations: { type: Boolean, default: true },
    enterToSend: { type: Boolean, default: true },
    showReadReceipts: { type: Boolean, default: true },
    showOnlineStatus: { type: Boolean, default: true },
    notifications: {
      browser: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
      muteAll: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`],
      maxlength: [USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`],
      match: [USERNAME_REGEX, 'Username may only contain letters, numbers, and underscores'],
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [EMAIL_REGEX, 'Invalid email address'],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`],
      // Critical: never returned by default. Callers must opt-in via `.select('+password')`.
      select: false,
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [DISPLAY_NAME_MIN_LENGTH, `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters`],
      maxlength: [DISPLAY_NAME_MAX_LENGTH, `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`],
    },
    avatarUrl: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    bio: {
      type: String,
      default: '',
      maxlength: [BIO_MAX_LENGTH, `Bio must be at most ${BIO_MAX_LENGTH} characters`],
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    lastSeenAt: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    mutedConversations: [{ type: Schema.Types.ObjectId, ref: 'Conversation' }],
    archivedConversations: [{ type: Schema.Types.ObjectId, ref: 'Conversation' }],
    preferences: { type: preferencesSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  },
);

// Mongoose 9 pre-hook: no `next` parameter — return a promise instead.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  // Cost 12 ≈ 250 ms on commodity hardware — strong against GPU brute force.
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true, versionKey: false });
  delete obj.password;
  return obj;
};

export const User = model('User', userSchema);
export default User;
