import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Sign a short, claim-minimal JWT for a given user id.
 * The token only carries `{ id }` — never role/email — so privilege
 * checks always go through a fresh DB lookup in the auth middleware.
 */
export const generateToken = (userId) =>
  jwt.sign({ id: String(userId) }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
