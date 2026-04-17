import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { env, isProduction, validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { sanitizeRequest } from './middlewares/sanitize.middleware.js';
import { globalLimiter } from './middlewares/rateLimiters.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import messageRoutes, {
  conversationMessageRouter,
} from './routes/message.routes.js';
import userRoutes from './routes/user.routes.js';
import uploadRoutes from './routes/upload.routes.js';

validateEnv();

const app = express();

// 1) Hide framework fingerprint.
app.disable('x-powered-by');

// 2) Security headers.
app.use(helmet());

// 3) Strict CORS — explicit origin, credentials only for the whitelisted client.
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }),
);

// 4) Response compression.
app.use(compression());

// 5) Body parsers — small limit; images go through the dedicated /upload route.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 6) NoSQL injection sanitizer (Express 5 safe; skips req.query).
app.use(sanitizeRequest);

// 7) Request logging in non-production only.
if (!isProduction) {
  app.use(morgan('dev'));
}

// 8) Global rate limit on the API surface.
app.use('/api', globalLimiter);

// 9) Health check — cheap probe for uptime monitors.
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// 10) Feature routes.
app.use('/api/auth', authRoutes); // STEP 3
// Conversation-scoped message routes must be mounted BEFORE the
// generic conversation router so `/conversations/:id/messages/...`
// resolves to the message handlers.
app.use('/api/conversations/:id/messages', conversationMessageRouter); // STEP 7
app.use('/api/conversations', conversationRoutes); // STEP 6
app.use('/api/messages', messageRoutes); // STEP 7
app.use('/api/users', userRoutes); // STEP 8
app.use('/api/upload', uploadRoutes); // STEP 8
//     app.use('/api/notifications', notifyRoutes);// STEP 16
//     app.use('/api/admin', adminRoutes);        // STEP 17

// 11) 404 + error handler MUST be last.
app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);
// Socket.io will be attached to httpServer in STEP 13.

const start = async () => {
  await connectDB();
  httpServer.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
};

start();

const shutdown = (signal) => {
  console.log(`[server] received ${signal}, shutting down...`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
