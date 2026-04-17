import api from './axios.js';

/**
 * User service — `/api/users/*` and `/api/reports`.
 *
 * `reportTarget` is intentionally co-located here even though it hits a
 * different mount point: from the UI's perspective "report" is always
 * an action you take *against another user* (or one of their messages),
 * so grouping it next to block/unblock keeps callers tidy.
 */

export const searchUsers = async (q, { limit = 10 } = {}) => {
  const { data } = await api.get('/users/search', { params: { q, limit } });
  return data;
};

export const getProfile = async (username) => {
  const { data } = await api.get(`/users/${encodeURIComponent(username)}`);
  return data;
};

export const updatePreferences = async (preferences) => {
  const { data } = await api.patch('/users/me/preferences', preferences);
  return data;
};

export const getBlockedUsers = async () => {
  const { data } = await api.get('/users/me/blocked');
  return data;
};

export const blockUser = async (userId) => {
  const { data } = await api.post(`/users/${userId}/block`);
  return data;
};

export const unblockUser = async (userId) => {
  const { data } = await api.delete(`/users/${userId}/block`);
  return data;
};

/**
 * Submit a user/message report. Payload mirrors `validateReport` on the
 * server: `{ targetType: 'user' | 'message', targetId, reason, details? }`.
 */
export const reportTarget = async (payload) => {
  const { data } = await api.post('/reports', payload);
  return data;
};
