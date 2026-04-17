import api from './axios.js';

/**
 * Message service — split between the conversation-scoped surface
 * (`/api/conversations/:id/messages`) and the flat per-message surface
 * (`/api/messages/:id/...`). Callers shouldn't need to know which.
 *
 * `sendMessage` is exposed as a REST fallback. The primary send path is
 * the Socket.io `message:send` event (real-time + ack), but if the
 * socket is disconnected the UI degrades to this HTTP call so the user
 * never loses a message they typed.
 */

export const getMessages = async (conversationId, { before, limit = 30 } = {}) => {
  const { data } = await api.get(`/conversations/${conversationId}/messages`, {
    params: { before, limit },
  });
  return data;
};

export const sendMessage = async (conversationId, payload) => {
  const { data } = await api.post(
    `/conversations/${conversationId}/messages`,
    payload,
  );
  return data;
};

export const editMessage = async (messageId, text) => {
  const { data } = await api.patch(`/messages/${messageId}`, { text });
  return data;
};

/**
 * Soft-delete by default. The `scope` parameter ('self' | 'everyone')
 * mirrors the socket `message:delete` event; the server reads it from
 * the request body and applies the same authorisation rules
 * (sender + 5-min window OR admin for 'everyone'). `hard` is reserved
 * for admin UI which calls `forceDeleteMessage` in `admin.service`.
 */
export const deleteMessage = async (
  messageId,
  { scope = 'self', hard = false } = {},
) => {
  const { data } = await api.delete(`/messages/${messageId}`, {
    params: hard ? { hard: 'true' } : undefined,
    data: { for: scope },
  });
  return data;
};

export const toggleReaction = async (messageId, emoji) => {
  const { data } = await api.post(`/messages/${messageId}/reactions`, { emoji });
  return data;
};

export const searchMessages = async (conversationId, q, { limit = 30 } = {}) => {
  const { data } = await api.get(
    `/conversations/${conversationId}/messages/search`,
    { params: { q, limit } },
  );
  return data;
};
