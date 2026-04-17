import api from './axios.js';

/**
 * Conversation service — `/api/conversations/*`.
 *
 * Naming note: `leaveOrDeleteConversation` maps to a single backend
 * `DELETE /:id` because the controller decides which semantic to apply
 * (last admin → delete; otherwise → leave). Surfacing one method here
 * keeps the UI free of that branching logic.
 */

export const getConversations = async ({ archived = false, page = 1, limit = 20 } = {}) => {
  const { data } = await api.get('/conversations', {
    params: { archived, page, limit },
  });
  return data;
};

export const getConversation = async (id) => {
  const { data } = await api.get(`/conversations/${id}`);
  return data;
};

export const createDirect = async (userId) => {
  const { data } = await api.post('/conversations/direct', { userId });
  return data;
};

export const createGroup = async (payload) => {
  const { data } = await api.post('/conversations/group', payload);
  return data;
};

export const updateGroup = async (id, payload) => {
  const { data } = await api.patch(`/conversations/${id}`, payload);
  return data;
};

/**
 * Server contract: `POST /:id/members` expects `{ userIds: [...] }`
 * (see `validateAddMembers`). Keeping the client parameter name aligned
 * avoids accidental drift between the wire payload and the call site.
 */
export const addMembers = async (id, userIds) => {
  const { data } = await api.post(`/conversations/${id}/members`, { userIds });
  return data;
};

export const removeMember = async (id, userId) => {
  const { data } = await api.delete(`/conversations/${id}/members/${userId}`);
  return data;
};

/**
 * Toggles a member's admin role. `promote` flag avoids exposing two
 * separate methods for what is conceptually one binary state change.
 */
export const promoteAdmin = async (id, userId, { promote = true } = {}) => {
  const { data } = promote
    ? await api.post(`/conversations/${id}/admins/${userId}`)
    : await api.delete(`/conversations/${id}/admins/${userId}`);
  return data;
};

export const toggleMute = async (id) => {
  const { data } = await api.post(`/conversations/${id}/mute`);
  return data;
};

export const toggleArchive = async (id) => {
  const { data } = await api.post(`/conversations/${id}/archive`);
  return data;
};

export const leaveOrDeleteConversation = async (id) => {
  const { data } = await api.delete(`/conversations/${id}`);
  return data;
};

export const markAsRead = async (id) => {
  const { data } = await api.post(`/conversations/${id}/read`);
  return data;
};

export const getUnreadSummary = async () => {
  const { data } = await api.get('/conversations/unread-summary');
  return data;
};
