import { Router } from 'express';
import {
  searchUsers,
  getPublicProfile,
  updatePreferences,
  getBlockedUsers,
} from '../controllers/user.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
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
router.get('/:username', validateUsername, getPublicProfile);

export default router;
