import mongoose from 'mongoose';
import { Conversation } from './Conversation.js';
import {
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  MESSAGE_TEXT_MAX_LENGTH,
  REACTION_EMOJI_MAX_LENGTH,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

/**
 * Per-recipient read marker. Stored as an array of subdocs (rather than a
 * Map) so we can run aggregation-style queries — e.g. "messages unread by
 * user X" — without touching dynamic field paths.
 */
const readReceiptSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * One reaction per user per message. Replacement (not stacking) is enforced
 * at the service / controller layer; the schema only validates shape.
 */
const reactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: {
      type: String,
      required: true,
      trim: true,
      maxlength: [
        REACTION_EMOJI_MAX_LENGTH,
        `Reaction emoji must be at most ${REACTION_EMOJI_MAX_LENGTH} characters`,
      ],
    },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'conversationId is required'],
      index: true,
    },
    // Nullable: when the sender deletes their account we anonymize the
    // reference (set to null) instead of deleting the message — keeps
    // group-chat history coherent for the remaining participants.
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    type: {
      type: String,
      enum: Object.values(MESSAGE_TYPES),
      default: MESSAGE_TYPES.TEXT,
      required: true,
    },
    text: {
      type: String,
      default: '',
      maxlength: [
        MESSAGE_TEXT_MAX_LENGTH,
        `Message text must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
      ],
    },
    imageUrl: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    readBy: { type: [readReceiptSchema], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedFor: {
      type: String,
      enum: Object.values(MESSAGE_DELETED_FOR),
      default: MESSAGE_DELETED_FOR.NONE,
    },
    /**
     * Per-user "delete for self" tombstones. Storing user ids here lets us
     * filter the message out of the requester's history without destroying
     * the row for the rest of the participants. Filtered at read time.
     */
    hiddenFor: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  { timestamps: true },
);

// Primary access pattern: paginated history for one conversation, newest first.
messageSchema.index({ conversationId: 1, createdAt: -1 });

/**
 * Mongoose 9 pre-hook: no `next` parameter — return a promise (or throw).
 * Cross-field invariants the per-field validators cannot express.
 */
messageSchema.pre('save', async function () {
  if (this.type === MESSAGE_TYPES.TEXT) {
    if (!this.text || this.text.trim().length === 0) {
      throw new Error('Text message cannot be empty');
    }
  }

  if (this.type === MESSAGE_TYPES.IMAGE) {
    if (!this.imageUrl) {
      throw new Error('Image message requires imageUrl');
    }
  }

  // Idempotency: collapse duplicate readBy entries for the same user.
  if (Array.isArray(this.readBy) && this.readBy.length > 1) {
    const seen = new Set();
    this.readBy = this.readBy.filter((entry) => {
      const uid = entry?.user?.toString();
      if (!uid || seen.has(uid)) return false;
      seen.add(uid);
      return true;
    });
  }

  // One reaction per user — keep the most recent if duplicates slip through.
  if (Array.isArray(this.reactions) && this.reactions.length > 1) {
    const lastByUser = new Map();
    for (const r of this.reactions) {
      const uid = r?.user?.toString();
      if (!uid) continue;
      lastByUser.set(uid, r);
    }
    this.reactions = Array.from(lastByUser.values());
  }

  // Server-side enforcement: a "delete for everyone" message exposes no
  // payload, regardless of what the caller passed in.
  if (this.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    this.text = '';
    this.imageUrl = '';
  }
});

/**
 * Build the denormalized snapshot that lives on `Conversation.lastMessage`.
 * Keeps the sidebar list endpoint free of per-row JOINs.
 */
const buildLastMessageSnapshot = (doc) => {
  let text = '';
  if (doc.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    text = '';
  } else if (doc.type === MESSAGE_TYPES.TEXT) {
    text = doc.text || '';
  } else if (doc.type === MESSAGE_TYPES.IMAGE) {
    text = '[image]';
  } else if (doc.type === MESSAGE_TYPES.SYSTEM) {
    text = doc.text || '';
  }

  return {
    text,
    sender: doc.sender ?? null,
    type: doc.type,
    createdAt: doc.createdAt,
  };
};

/**
 * Post-save hook: keep the parent Conversation in sync.
 *  - Refresh `lastMessage` snapshot for the sidebar preview.
 *  - Bump `updatedAt` (handled implicitly via the update — schema has
 *    `timestamps: true`).
 *  - Increment `unreadCounts` for every participant except the sender.
 *
 * Errors are logged but never re-thrown: the message has already been
 * persisted at this point, and surfacing a hook error would mislead the
 * caller into thinking the write failed.
 */
messageSchema.post('save', async function (doc) {
  try {
    if (!doc.isNew) return;

    const conversation = await Conversation.findById(doc.conversationId).select(
      'participants',
    );
    if (!conversation) return;

    const update = { $set: { lastMessage: buildLastMessageSnapshot(doc) } };

    if (doc.sender) {
      const senderId = doc.sender.toString();
      const inc = {};
      for (const participant of conversation.participants) {
        const pid = participant.toString();
        if (pid === senderId) continue;
        inc[`unreadCounts.${pid}`] = 1;
      }
      if (Object.keys(inc).length > 0) update.$inc = inc;
    }

    await Conversation.findByIdAndUpdate(doc.conversationId, update);
  } catch (err) {
    // Intentionally swallowed — see hook docstring above.
    console.error('[Message post-save] conversation sync failed:', err);
  }
});

export const Message = model('Message', messageSchema);
export default Message;
