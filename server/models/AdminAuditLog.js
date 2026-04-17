import mongoose from 'mongoose';
import { ADMIN_AUDIT_ACTIONS } from '../utils/constants.js';

const { Schema, model } = mongoose;

/**
 * Append-only audit trail for every admin moderation action.
 *
 * The collection is **write-only** at the application layer: there is
 * no public REST endpoint that reads from it, and no service helper
 * exposes a `find` over it. Forensic queries are run directly against
 * MongoDB by an operator with shell access — keeping reads off the API
 * surface removes the entire class of "compromised admin clears their
 * own trail" attack vectors.
 *
 * `meta` is a free-form mixed bag (previous status, new role, reason
 * note, etc.). Schema enforcement is intentionally loose here because
 * the action enum already constrains the *shape* of the meaningful
 * fields, and a strict subdoc per action would create churn every time
 * a new admin operation is added.
 *
 * `at` is independent of `createdAt` so callers can backfill or batch
 * insert without losing the actual operation timestamp; `createdAt`
 * still records when the row landed in Mongo.
 */
const adminAuditLogSchema = new Schema(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'adminId is required'],
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(ADMIN_AUDIT_ACTIONS),
      required: [true, 'action is required'],
      index: true,
    },
    targetType: { type: String, default: '' },
    targetId: { type: Schema.Types.ObjectId, default: null, index: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, minimize: false },
);

// Common forensic query: "every action this admin performed, newest first".
adminAuditLogSchema.index({ adminId: 1, at: -1 });

export const AdminAuditLog = model('AdminAuditLog', adminAuditLogSchema);
export default AdminAuditLog;
