import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async () => {
  try {
    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10_000,
    });

    // Avoid logging the URI — it can contain credentials.
    console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('error', (err) => {
      console.error('[db] connection error:', err.message);
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('[db] disconnected');
    });

    return conn;
  } catch (err) {
    console.error('[db] initial connection failed:', err.message);
    process.exit(1);
  }
};
