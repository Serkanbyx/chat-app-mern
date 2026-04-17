import mongoose from 'mongoose';
import {
  CONVERSATION_TYPES,
  MESSAGE_TYPES,
  GROUP_NAME_MAX_LENGTH,
  GROUP_MIN_PARTICIPANTS,
  GROUP_MAX_PARTICIPANTS,
  DIRECT_PARTICIPANTS,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

/**
 * Denormalized snapshot of the most recent message. Stored on the
 * conversation so the sidebar list endpoint can render the preview line
 * without a JOIN/aggregation per row. Kept intentionally tiny.
 */
const lastMessageSchema = new Schema(
  {
    text: { type: String, default: '' },
    sender: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: Object.values(MESSAGE_TYPES),
      default: MESSAGE_TYPES.TEXT,
    },
    createdAt: { type: Date, default: null },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(CONVERSATION_TYPES),
      default: CONVERSATION_TYPES.DIRECT,
      required: true,
      index: true,
    },
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator(arr) {
          if (!Array.isArray(arr)) return false;
          if (this.type === CONVERSATION_TYPES.DIRECT) {
            return arr.length === DIRECT_PARTICIPANTS;
          }
          return (
            arr.length >= GROUP_MIN_PARTICIPANTS &&
            arr.length <= GROUP_MAX_PARTICIPANTS
          );
        },
        message: 'Participants array length is invalid for this conversation type',
      },
    },
    name: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        GROUP_NAME_MAX_LENGTH,
        `Group name must be at most ${GROUP_NAME_MAX_LENGTH} characters`,
      ],
    },
    avatarUrl: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    admins: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
    lastMessage: { type: lastMessageSchema, default: null },
    // Map<userId, unreadCount>. Map (not plain object) gives us $inc on
    // dynamic keys and protects against prototype pollution by design.
    unreadCounts: {
      type: Map,
      of: { type: Number, min: 0, default: 0 },
      default: () => new Map(),
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Primary access pattern: "list my conversations sorted by recent activity".
conversationSchema.index({ participants: 1, updatedAt: -1 });

/**
 * Mongoose 9 pre-hook: no `next` parameter — return a promise (or throw).
 * Cross-field invariants that the per-field validators cannot express.
 */
conversationSchema.pre('save', async function () {
  if (this.type === CONVERSATION_TYPES.DIRECT) {
    if (this.participants.length !== DIRECT_PARTICIPANTS) {
      throw new Error('Direct conversation must have exactly 2 participants');
    }
    // Direct chats have no group-only metadata.
    this.name = '';
    this.avatarUrl = '';
    this.avatarPublicId = '';
    this.admins = [];
  }

  if (this.type === CONVERSATION_TYPES.GROUP) {
    if (!this.name || !this.name.trim()) {
      throw new Error('Group conversation requires a name');
    }
    if (this.participants.length < GROUP_MIN_PARTICIPANTS) {
      throw new Error('Group conversation requires at least 2 participants');
    }
    if (this.participants.length > GROUP_MAX_PARTICIPANTS) {
      throw new Error(
        `Group conversation cannot have more than ${GROUP_MAX_PARTICIPANTS} participants`,
      );
    }

    // Admins must be a subset of participants. Silently prune to keep the
    // invariant rather than throwing — admin removal is a normal operation.
    const participantSet = new Set(this.participants.map((p) => p.toString()));
    this.admins = this.admins.filter((a) => participantSet.has(a.toString()));

    // Group with zero admins is a dead end — STEP 6 promotes the next
    // participant. Here we only assert the invariant.
    if (this.admins.length === 0) {
      throw new Error('Group conversation must have at least one admin');
    }
  }
});

export const Conversation = model('Conversation', conversationSchema);
export default Conversation;
