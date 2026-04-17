import { asyncHandler } from '../utils/asyncHandler.js';
import { createReport } from '../utils/reportService.js';

/**
 * POST /api/reports
 *
 * Authenticated users file abuse reports against another user, a
 * specific message, or an entire conversation. The validator chain
 * (`validateReport`) has already enforced the enum surface and the
 * length cap on `description`; the service layer takes care of the
 * cooldown window and the per-target authorisation rules.
 *
 * The response intentionally omits the persisted document — clients
 * only need the new id and timestamps so the UI can render an inline
 * "report sent" toast without needing to reveal moderation state.
 */
export const createReportController = asyncHandler(async (req, res) => {
  const { targetType, targetId, reason, description = '' } = req.body;

  const report = await createReport({
    reporterId: req.user._id,
    targetType,
    targetId,
    reason,
    description,
  });

  res.status(201).json({
    success: true,
    message: 'Report submitted',
    data: {
      id: String(report._id),
      targetType: report.targetType,
      targetId: String(report.targetId),
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
});

export default { createReportController };
