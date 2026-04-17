import api from './axios.js';

/**
 * Auth service — thin wrapper around `/api/auth/*`.
 *
 * Every function returns the `data` payload (not the full Axios
 * response) so callers don't need to know the transport. Errors
 * propagate as-is; `axios.js` already strips a 401 session.
 */

export const register = async (payload) => {
  const { data } = await api.post('/auth/register', payload);
  return data;
};

export const login = async (payload) => {
  const { data } = await api.post('/auth/login', payload);
  return data;
};

export const getMe = async () => {
  const { data } = await api.get('/auth/me');
  return data;
};

export const updateProfile = async (payload) => {
  const { data } = await api.patch('/auth/profile', payload);
  return data;
};

export const changePassword = async (payload) => {
  const { data } = await api.patch('/auth/password', payload);
  return data;
};

/**
 * Hard-deletes the current account. Backend requires the password in
 * the request body as a re-auth gate; the caller MUST collect it from
 * a confirmation modal before calling this.
 */
export const deleteAccount = async (payload) => {
  const { data } = await api.delete('/auth/account', { data: payload });
  return data;
};
