import api from './axios.js';

/**
 * Admin service — `/api/admin/*`. Every endpoint here is gated by
 * `protect + adminOnly + adminLimiter` on the server, so the UI MUST
 * also gate its admin routes by `currentUser.role === 'admin'` — never
 * trust the absence of a 403 as proof of authorization.
 */

export const getStats = async () => {
  const { data } = await api.get('/admin/stats');
  return data;
};

export const listUsers = async ({ q, role, status, page = 1, limit = 20 } = {}) => {
  const { data } = await api.get('/admin/users', {
    params: { q, role, status, page, limit },
  });
  return data;
};

export const getUser = async (id) => {
  const { data } = await api.get(`/admin/users/${id}`);
  return data;
};

export const updateUserStatus = async (id, payload) => {
  const { data } = await api.patch(`/admin/users/${id}/status`, payload);
  return data;
};

export const updateUserRole = async (id, role) => {
  const { data } = await api.patch(`/admin/users/${id}/role`, { role });
  return data;
};

export const deleteUser = async (id) => {
  const { data } = await api.delete(`/admin/users/${id}`);
  return data;
};

export const listReports = async ({ status, targetType, page = 1, limit = 20 } = {}) => {
  const { data } = await api.get('/admin/reports', {
    params: { status, targetType, page, limit },
  });
  return data;
};

export const getReport = async (id) => {
  const { data } = await api.get(`/admin/reports/${id}`);
  return data;
};

export const updateReport = async (id, payload) => {
  const { data } = await api.patch(`/admin/reports/${id}`, payload);
  return data;
};

/**
 * Force-deletes a message regardless of sender or time-window. The
 * server still emits `message:deleted` so participants' UIs redact the
 * bubble in real time — no manual client-side broadcast needed.
 */
export const forceDeleteMessage = async (id) => {
  const { data } = await api.delete(`/admin/messages/${id}`);
  return data;
};

export const getConversationMessages = async (id, { before, limit = 50 } = {}) => {
  const { data } = await api.get(`/admin/conversations/${id}/messages`, {
    params: { before, limit },
  });
  return data;
};
