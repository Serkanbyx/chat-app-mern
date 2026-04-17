export const ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
});

export const THEME = Object.freeze(['light', 'dark', 'system']);
export const FONT_SIZE = Object.freeze(['sm', 'md', 'lg']);
export const CONTENT_DENSITY = Object.freeze(['compact', 'comfortable']);

export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const BIO_MAX_LENGTH = 200;

export const DELETED_USER_LABEL = 'Deleted User';

export const CONVERSATION_TYPES = Object.freeze({
  DIRECT: 'direct',
  GROUP: 'group',
});

export const MESSAGE_TYPES = Object.freeze({
  TEXT: 'text',
  IMAGE: 'image',
  SYSTEM: 'system',
});

export const MESSAGE_DELETED_FOR = Object.freeze({
  NONE: 'none',
  SELF: 'self',
  EVERYONE: 'everyone',
});

// Storage cap + DoS protection. Long-form content belongs in attachments.
export const MESSAGE_TEXT_MAX_LENGTH = 4000;
// Single grapheme cluster + ZWJ sequence comfortably fits in 4 chars.
export const REACTION_EMOJI_MAX_LENGTH = 4;
// Edit window: 15 minutes from message creation.
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
// Delete-for-everyone window for the sender: 5 minutes from creation.
export const MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS = 5 * 60 * 1000;

export const GROUP_NAME_MAX_LENGTH = 50;
export const GROUP_MIN_PARTICIPANTS = 2;
export const GROUP_MAX_PARTICIPANTS = 100;
export const DIRECT_PARTICIPANTS = 2;

export const NOTIFICATION_TYPES = Object.freeze({
  MESSAGE: 'message',
  MENTION: 'mention',
  GROUP_INVITE: 'groupInvite',
  ADMIN_ACTION: 'adminAction',
});

// Hard cap on the rendered preview text. Browser Notification bodies
// truncate beyond ~150 chars anyway; 200 leaves room for short
// templates ("{actor}: {preview}") without the preview being clipped
// to nothing for normal display names.
export const NOTIFICATION_TEXT_MAX_LENGTH = 200;

// Anti-spam collapse window for "new message" notifications. Inside
// this window, repeated messages from the same conversation overwrite
// the existing unread notification instead of stacking new rows.
export const NOTIFICATION_COLLAPSE_WINDOW_MS = 30 * 1000;

/* -------------------- STEP 18 — Reports & moderation -------------------- */

export const REPORT_TARGET_TYPES = Object.freeze({
  USER: 'user',
  MESSAGE: 'message',
  CONVERSATION: 'conversation',
});

export const REPORT_REASONS = Object.freeze({
  SPAM: 'spam',
  HARASSMENT: 'harassment',
  INAPPROPRIATE: 'inappropriate',
  OTHER: 'other',
});

export const REPORT_STATUSES = Object.freeze({
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  DISMISSED: 'dismissed',
  ACTION_TAKEN: 'actionTaken',
});

// Hard cap on free-text fields. Same length on both sides keeps the
// document predictable and matches the moderator UI textarea limit.
export const REPORT_DESCRIPTION_MAX_LENGTH = 500;
export const REPORT_REVIEW_NOTE_MAX_LENGTH = 500;

// Anti-weaponisation guard: the SAME reporter cannot file a fresh
// report against the SAME target inside this window. Limits brigading
// patterns where coordinated accounts spam a target's report queue.
export const REPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Closed enum of admin-side actions tracked by `AdminAuditLog`. Adding
 * a new admin operation requires touching this enum AND the writer in
 * `adminAudit.js` — intentional friction so the audit trail can never
 * silently drop a class of action.
 */
export const ADMIN_AUDIT_ACTIONS = Object.freeze({
  USER_SUSPEND: 'user.suspend',
  USER_REINSTATE: 'user.reinstate',
  USER_ROLE_CHANGE: 'user.roleChange',
  USER_DELETE: 'user.delete',
  MESSAGE_FORCE_DELETE: 'message.forceDelete',
  CONVERSATION_VIEW: 'conversation.view',
  REPORT_REVIEW: 'report.review',
});
