import api from './axios.js';

/**
 * Upload service — `/api/upload/*`.
 *
 * Both endpoints accept a single binary field (`image`) as multipart
 * form data — the field name MUST match `upload.middleware.js` on the
 * server (`upload.single('image')`) or Multer rejects the request with
 * `LIMIT_UNEXPECTED_FILE`. Axios attaches the correct
 * `multipart/form-data` boundary automatically when the body is a
 * `FormData`, so we MUST NOT set the `Content-Type` header manually
 * (doing so would strip the boundary and the server would 400 with
 * "Unexpected end of form").
 *
 * `timeout` is bumped from the global 15 s to 60 s because uploads
 * over slow mobile networks routinely exceed the default — failing
 * a working upload is worse UX than a longer spinner.
 */

const buildForm = (file) => {
  const form = new FormData();
  form.append('image', file);
  return form;
};

export const uploadAvatar = async (file) => {
  const { data } = await api.post('/upload/avatar', buildForm(file), {
    timeout: 60_000,
  });
  return data;
};

/**
 * Remove the current user's avatar — clears `avatarUrl` / `avatarPublicId`
 * on the server AND destroys the Cloudinary asset. Idempotent: calling
 * this with no avatar set returns `{ removed: false }` instead of erroring.
 */
export const removeAvatar = async () => {
  const { data } = await api.delete('/upload/avatar');
  return data;
};

export const uploadMessageImage = async (file) => {
  const { data } = await api.post('/upload/message-image', buildForm(file), {
    timeout: 60_000,
  });
  return data;
};

/**
 * `uploadGroupAvatar` — upload an image intended for a *group conversation*
 * avatar, NOT the caller's profile avatar.
 *
 * We deliberately route this to `/upload/message-image` instead of
 * `/upload/avatar`: the avatar endpoint persists the returned URL onto
 * the calling user's profile (replacing their personal avatar), which
 * would corrupt the creator's identity every time they create a group.
 * The message-image endpoint runs through the same MIME/size guards
 * (`uploadLimiter`, JPEG/PNG/WEBP, MAX_UPLOAD_SIZE_MB) but only returns
 * the upload metadata, leaving the User document untouched. The
 * conversation `avatarUrl` validator on the server is cloud-scoped
 * (not folder-scoped) so the returned URL passes validation cleanly.
 */
export const uploadGroupAvatar = (file) => uploadMessageImage(file);
