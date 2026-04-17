import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { isProduction } from '../config/env.js';
import { ADMIN_AUDIT_ACTIONS } from './constants.js';

const ALLOWED_ACTIONS = new Set(Object.values(ADMIN_AUDIT_ACTIONS));

/**
 * Best-effort append to the admin audit trail.
 *
 * Failures here MUST NEVER bubble up — admin moderation actions have
 * already been persisted by the time we log, and surfacing a Mongo
 * write error would mislead the operator into thinking the moderation
 * action itself failed. We log to stderr in non-prod for diagnostics
 * and otherwise swallow the error silently.
 *
 * Caller passes the action enum value directly (so a typo fails fast
 * here at the `ALLOWED_ACTIONS` gate) and a `meta` object whose shape
 * is action-specific. `meta` is shallow-cloned so the caller cannot
 * mutate the persisted document after the fact.
 */
export const writeAuditLog = async ({
  adminId,
  action,
  targetType = '',
  targetId = null,
  meta = {},
}) => {
  if (!adminId) return null;
  if (!ALLOWED_ACTIONS.has(action)) {
    if (!isProduction) {
      console.warn('[adminAudit] unknown action ignored:', action);
    }
    return null;
  }

  try {
    return await AdminAuditLog.create({
      adminId,
      action,
      targetType: typeof targetType === 'string' ? targetType : '',
      targetId: targetId ?? null,
      meta: meta && typeof meta === 'object' ? { ...meta } : {},
      at: new Date(),
    });
  } catch (err) {
    if (!isProduction) {
      console.warn('[adminAudit] write failed:', err?.message || err);
    }
    return null;
  }
};

export default writeAuditLog;
