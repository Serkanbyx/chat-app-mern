import mongoose from 'mongoose';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TEXT_MAX_LENGTH,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

/**
 * Persistent notification row. Stored per-recipient (not per-event) so
 * the inbox view is a flat scan against `recipient` and so a single
 * fan-out can produce N independent rows that recipients dismiss
 * individually.
 *
 * `text` is ALWAYS server-generated from a fixed template — we never
 * accept a raw client string here, otherwise an authenticated client
 * could write arbitrary HTML-shaped content into another user's inbox.
 */
const notificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'recipient is required'],
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: [true, 'type is required'],
    },
    // Optional context — present for chat-bound notifications, null for
    // adminAction / system-style events that have no parent conversation.
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    text: {
      type: String,
      required: [true, 'text is required'],
      trim: true,
      maxlength: [
        NOTIFICATION_TEXT_MAX_LENGTH,
        `Notification text must be at most ${NOTIFICATION_TEXT_MAX_LENGTH} characters`,
      ],
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// Inbox hot-path: "newest unread first for a user". Compound index
// covers the common ordering (`createdAt DESC`) AND the unread-count
// query (`{ recipient, isRead: false }`).
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// Collapse-window lookup: "is there a recent unread `message`-type row
// for this (recipient, conversation) pair?". Matching the field order
// of the persistence trigger keeps the query fully covered.
notificationSchema.index({
  recipient: 1,
  conversationId: 1,
  type: 1,
  createdAt: -1,
});

export const Notification = model('Notification', notificationSchema);
export default Notification;
