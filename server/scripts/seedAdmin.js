import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { ROLES } from '../utils/constants.js';

/**
 * Idempotent admin seeder. Run with `npm run seed:admin`.
 * Safe to invoke repeatedly — it only creates an admin if NONE exists.
 * NEVER logs the admin password.
 */
const run = async () => {
  await connectDB();

  try {
    const existing = await User.findOne({ role: ROLES.ADMIN }).lean();
    if (existing) {
      console.log(`[seed] Admin already exists (username: ${existing.username}). Skipping.`);
      return;
    }

    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME } = env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_USERNAME) {
      throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_USERNAME must be set in .env');
    }

    await User.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: 'Administrator',
      role: ROLES.ADMIN,
    });

    console.log('[seed] Admin seeded');
  } finally {
    await mongoose.disconnect();
  }
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exit(1);
  });
