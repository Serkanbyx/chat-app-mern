import { Router } from 'express';
import {
  searchUsers,
  getPublicProfile,
  updatePreferences,
  getBlockedUsers,
  blockUser,
  unblockUser,
} from '../controllers/user.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validateObjectId } from '../validators/common.validator.js';
import {
  validateSearchQuery,
  validateUsername,
  validatePreferences,
} from '../validators/user.validator.js';

const router = Router();

router.use(protect);

// Order matters: the static `/search` and `/me/...` paths MUST be
// registered before the dynamic `/:username` to avoid being shadowed.
router.get('/search', validateSearchQuery, searchUsers);
router.get('/me/blocked', getBlockedUsers);
router.patch('/me/preferences', validatePreferences, updatePreferences);

// Block routes use a 24-hex `:userId` validated as a Mongo id, so they do
// NOT collide with `/:username` (which only matches the username regex).
// Still placed BEFORE the username route as a defensive convention.
router.post('/:userId/block', validateObjectId('userId'), blockUser);
router.delete('/:userId/block', validateObjectId('userId'), unblockUser);

router.get('/:username', validateUsername, getPublicProfile);

export default router;
