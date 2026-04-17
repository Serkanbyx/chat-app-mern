import { Router } from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  deleteAccount,
} from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { authLimiter } from '../middlewares/rateLimiters.js';
import {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateDeleteAccount,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/register', authLimiter, validateRegister, register);
router.post('/login', authLimiter, validateLogin, login);

router.get('/me', protect, getMe);
router.patch('/profile', protect, validateUpdateProfile, updateProfile);
router.patch('/password', protect, validateChangePassword, changePassword);
router.delete('/account', protect, validateDeleteAccount, deleteAccount);

export default router;
