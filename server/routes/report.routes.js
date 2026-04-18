import { Router } from 'express';
import { createReportController } from '../controllers/report.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validateReport } from '../validators/report.validator.js';

const router = Router();

router.use(protect);

/**
 * The user-facing reporting surface intentionally exposes ONLY the
 * create endpoint. Listing or fetching reports is admin-only and lives
 * under `/api/admin/reports/*` — keeping the reporter blind to other
 * users' reports avoids leaking moderation state and removes the entire
 * "scrape the queue" enumeration vector.
 *
 * @openapi
 * /api/reports:
 *   post:
 *     tags: [Reports]
 *     summary: Submit a report against a user, message, or conversation
 *     description: |
 *       Same `(reporter, target)` pair is rate-limited to one report per
 *       24 hours. Listing/reviewing reports lives under `/api/admin/reports/*`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetType, targetId, reason]
 *             properties:
 *               targetType: { type: string, enum: [user, message, conversation] }
 *               targetId: { type: string }
 *               reason: { type: string, enum: [spam, harassment, inappropriate, other] }
 *               details: { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: Report submitted }
 *       400: { description: Validation error }
 *       409: { description: Already reported within cooldown window }
 */
router.post('/', validateReport, createReportController);

export default router;
