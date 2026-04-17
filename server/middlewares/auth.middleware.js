import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { USER_STATUS } from '../utils/constants.js';

/**
 * Pulls a Bearer token from the Authorization header only.
 * Cookies / query strings are intentionally NOT supported — keeping the
 * token surface tiny removes CSRF concerns entirely.
 */
const extractBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
};

const verifyAndLoadUser = async (token) => {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  if (!payload?.id) throw ApiError.unauthorized('Invalid token payload');

  const user = await User.findById(payload.id);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('Account is not active');
  }
  return user;
};

/** Hard auth — rejects when token is missing/invalid/inactive. */
export const protect = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  req.user = await verifyAndLoadUser(token);
  next();
});

/** Soft auth — sets `req.user` when present, never throws. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    req.user = await verifyAndLoadUser(token);
  } catch {
    req.user = null;
  }
  next();
});
