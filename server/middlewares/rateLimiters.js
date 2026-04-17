import rateLimit from 'express-rate-limit';

const baseOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
};

const minutes = (n) => n * 60 * 1000;

/** Wide net for the entire `/api` surface. */
export const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(15),
  max: 300,
});

/** Aggressive limit on auth endpoints — slows down credential stuffing. */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(15),
  max: 10,
});

/** REST fallback for sending messages (Socket.io is the primary path). */
export const messageLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(1),
  max: 60,
});

/** Image upload bucket — small, expensive operations. */
export const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(10),
  max: 20,
});

/** Admin endpoints — busier than auth, lighter than global. */
export const adminLimiter = rateLimit({
  ...baseOptions,
  windowMs: minutes(15),
  max: 200,
});
