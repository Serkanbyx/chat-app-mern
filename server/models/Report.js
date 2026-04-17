import mongoose from 'mongoose';
import {
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_DESCRIPTION_MAX_LENGTH,
  REPORT_REVIEW_NOTE_MAX_LENGTH,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

/**
 * User-filed abuse report. Polymorphic via `(targetType, targetId)` so
 * one collection covers user / message / conversation reports without
 * exploding the schema surface or requiring three near-identical
 * routers.
 *
 * `targetId` is intentionally NOT a `ref` — Mongoose `ref` is bound to a
 * single model and we want admin lookups to populate the appropriate
 * collection at the controller layer based on `targetType`. This keeps
 * the document small (no per-type discriminator) and the read path
 * explicit.
 *
 * `description` is treated as untrusted user input: the validator
 * length-caps it and the report controller passes it through a strict
 * sanitizer before persistence (XSS defence-in-depth — even though
 * clients render reports as plain text today).
 */
const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'reporter is required'],
      index: true,
    },
    targetType: {
      type: String,
      enum: Object.values(REPORT_TARGET_TYPES),
      required: [true, 'targetType is required'],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, 'targetId is required'],
      index: true,
    },
    reason: {
      type: String,
      enum: Object.values(REPORT_REASONS),
      required: [true, 'reason is required'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        REPORT_DESCRIPTION_MAX_LENGTH,
        `Description must be at most ${REPORT_DESCRIPTION_MAX_LENGTH} characters`,
      ],
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUSES),
      default: REPORT_STATUSES.PENDING,
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        REPORT_REVIEW_NOTE_MAX_LENGTH,
        `Review note must be at most ${REPORT_REVIEW_NOTE_MAX_LENGTH} characters`,
      ],
    },
  },
  { timestamps: true },
);

// Hot-path: "list pending reports for the moderation queue".
reportSchema.index({ status: 1, createdAt: -1 });

// Cooldown lookup: "has this reporter already reported this target
// inside the last 24 h?". Field order mirrors the cooldown query in
// `report.controller.js` so the index is fully covered.
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1, createdAt: -1 });

export const Report = model('Report', reportSchema);
export default Report;
