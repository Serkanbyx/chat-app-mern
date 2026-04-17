/**
 * Generic offset-based pagination helper. Cursor-based pagination for chat
 * history lives in messageService — this util powers list endpoints
 * (conversations, notifications, search results, etc).
 *
 * `limit` is hard-clamped to `maxLimit` to defuse single-request data
 * exfiltration; `page` is forced to a positive integer to block negative
 * skip values that could otherwise blow up the driver.
 */
export const parsePagination = (
  query = {},
  { defaultLimit = 20, maxLimit = 50 } = {},
) => {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
};

/**
 * Build the standard pagination envelope. Always includes at least one
 * page so the client can render an "empty" state without divide-by-zero
 * surprises.
 */
export const buildPageMeta = ({ total, page, limit }) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil((total || 0) / Math.max(1, limit))),
});
