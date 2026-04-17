import api from './axios.js';

/**
 * Upload service — `/api/upload/*`.
 *
 * Both endpoints accept a single binary field (`file`) as multipart
 * form data. Axios attaches the correct `multipart/form-data` boundary
 * automatically when the body is a `FormData`, so we MUST NOT set the
 * `Content-Type` header manually (doing so would strip the boundary
 * and the server would 400 with "Unexpected end of form").
 *
 * `timeout` is bumped from the global 15 s to 60 s because uploads
 * over slow mobile networks routinely exceed the default — failing
 * a working upload is worse UX than a longer spinner.
 */

const buildForm = (file) => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export const uploadAvatar = async (file) => {
  const { data } = await api.post('/upload/avatar', buildForm(file), {
    timeout: 60_000,
  });
  return data;
};

export const uploadMessageImage = async (file) => {
  const { data } = await api.post('/upload/message-image', buildForm(file), {
    timeout: 60_000,
  });
  return data;
};
