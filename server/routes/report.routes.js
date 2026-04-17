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
 */
router.post('/', validateReport, createReportController);

export default router;
