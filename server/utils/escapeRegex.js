/**
 * Escape every regex metacharacter in `s` so the result can be safely
 * concatenated into a `RegExp(...)` literal. Mandatory before passing any
 * user-controlled value to a Mongo `$regex` query — neutralizes the
 * catastrophic-backtracking patterns that drive ReDoS DoS attacks.
 */
export const escapeRegex = (s) =>
  String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default escapeRegex;
