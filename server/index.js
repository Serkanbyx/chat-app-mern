import http from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { env, isProduction, validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { createSocketServer } from './config/socket.js';
import { swaggerSpec, swaggerUiOptions } from './config/swagger.js';
import { registerSocketHandlers } from './sockets/index.js';
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
import notificationRoutes from './routes/notification.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportRoutes from './routes/report.routes.js';

// `package.json` is read at startup so the welcome page version stays
// in lockstep with the actual deployed build — never hardcoded.
const require = createRequire(import.meta.url);
const { version: appVersion } = require('./package.json');

validateEnv();

const app = express();

// 1) Hide framework fingerprint.
app.disable('x-powered-by');

// 2) Security headers — strict defaults applied globally; the welcome
//    HTML at `/` and the Swagger UI at `/api-docs` opt out of CSP at
//    the route level only (see below) so their inline styles can render.
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

// 9.1) API documentation — Swagger UI + raw OpenAPI JSON.
//      A route-scoped Helmet override disables CSP ONLY here so the
//      Swagger UI bundle (inline scripts + styles) can execute. The
//      strict global Helmet from step 2 still applies everywhere else.
const docsRelaxedHelmet = helmet({ contentSecurityPolicy: false });

app.get('/api-docs.json', docsRelaxedHelmet, (_req, res) => {
  res.status(200).json(swaggerSpec);
});

app.use(
  '/api-docs',
  docsRelaxedHelmet,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, swaggerUiOptions),
);

// 9.2) Welcome page — chat-themed landing with quick links to docs/health.
app.get('/', docsRelaxedHelmet, (_req, res) => {
  res.status(200).type('html').send(renderWelcomePage(appVersion));
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
app.use('/api/notifications', notificationRoutes); // STEP 16
app.use('/api/admin', adminRoutes); // STEP 17
app.use('/api/reports', reportRoutes); // STEP 18

// 11) 404 + error handler MUST be last.
app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);

// 12) Socket.io — attached to the same HTTP server so REST and
//     WebSocket share one port (no extra firewall hole) and one CORS
//     policy (single source of truth). Handshake auth + connection
//     lifecycle are wired in `sockets/index.js`.
const io = createSocketServer(httpServer, env);
registerSocketHandlers(io);

// Expose `io` to Express handlers (for emitting from REST routes, e.g.
// admin force-disconnect). Reading via `req.app.get('io')` keeps this
// dependency explicit and avoids creating a circular import.
app.set('io', io);

const start = async () => {
  await connectDB();
  httpServer.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
};

start();

const shutdown = (signal) => {
  console.log(`[server] received ${signal}, shutting down...`);
  // Order matters: close Socket.io first so in-flight handshakes and
  // long-poll requests stop before the HTTP server tears down.
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/**
 * Renders the public welcome page served at `/`.
 *
 * The visual language leans into the project's chat domain: floating
 * speech-bubble decorations, an indigo→violet→pink gradient that mirrors
 * the chat surface, and a typing-indicator pulse on the title underline.
 * All assets are pure CSS — no remote fonts, images, or fetches.
 */
const renderWelcomePage = (version) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chat App API</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --indigo: #6366f1;
      --violet: #8b5cf6;
      --pink: #ec4899;
      --ink: #0f172a;
      --soft: rgba(255, 255, 255, 0.92);
      --line: rgba(255, 255, 255, 0.18);
    }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 800px at 10% 10%, rgba(236, 72, 153, 0.35), transparent 60%),
        radial-gradient(900px 700px at 90% 20%, rgba(139, 92, 246, 0.4), transparent 60%),
        radial-gradient(1100px 800px at 50% 100%, rgba(99, 102, 241, 0.45), transparent 60%),
        linear-gradient(135deg, #312e81 0%, #4c1d95 50%, #831843 100%);
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 32px 20px;
      overflow-x: hidden;
      position: relative;
    }
    /* Decorative chat bubbles floating in the background. */
    body::before, body::after {
      content: "";
      position: absolute;
      width: 220px;
      height: 140px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 30px 30px 30px 8px;
      filter: blur(0.3px);
      animation: float 14s ease-in-out infinite;
      pointer-events: none;
    }
    body::before { top: 8%; left: 6%; transform: rotate(-8deg); }
    body::after  { bottom: 10%; right: 7%; transform: rotate(12deg); width: 260px; height: 160px; border-radius: 30px 30px 8px 30px; animation-delay: -7s; }
    @keyframes float {
      0%, 100% { transform: translateY(0) rotate(-8deg); }
      50%      { transform: translateY(-18px) rotate(-4deg); }
    }
    .container {
      width: min(620px, 100%);
      background: var(--soft);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-radius: 28px;
      padding: 56px 44px 32px;
      box-shadow:
        0 30px 80px -20px rgba(15, 23, 42, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.6) inset;
      text-align: center;
      position: relative;
      z-index: 1;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--indigo);
      background: rgba(99, 102, 241, 0.1);
      padding: 8px 14px;
      border-radius: 999px;
      margin-bottom: 20px;
    }
    .badge .dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
      animation: pulse 1.8s ease-out infinite;
    }
    @keyframes pulse {
      0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
      100% { box-shadow: 0 0 0 14px rgba(34, 197, 94, 0); }
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(34px, 6vw, 48px);
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, var(--indigo), var(--violet) 50%, var(--pink));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .typing {
      display: inline-flex;
      gap: 5px;
      margin: 6px 0 18px;
      padding: 8px 14px;
      background: linear-gradient(135deg, var(--indigo), var(--violet));
      border-radius: 18px 18px 18px 4px;
      box-shadow: 0 8px 18px -8px rgba(99, 102, 241, 0.6);
    }
    .typing span {
      width: 7px; height: 7px; border-radius: 50%;
      background: rgba(255, 255, 255, 0.95);
      animation: blink 1.2s infinite ease-in-out;
    }
    .typing span:nth-child(2) { animation-delay: 0.15s; }
    .typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes blink {
      0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
      40%           { opacity: 1;    transform: translateY(-3px); }
    }
    .version {
      display: inline-block;
      margin: 0 0 28px;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      background: #f1f5f9;
      padding: 4px 12px;
      border-radius: 999px;
      font-variant-numeric: tabular-nums;
    }
    p.lead {
      margin: 0 0 32px;
      font-size: 16px;
      line-height: 1.6;
      color: #334155;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
      margin-bottom: 36px;
    }
    .links a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    }
    .btn-primary {
      color: #fff;
      background: linear-gradient(135deg, var(--indigo), var(--violet));
      box-shadow: 0 12px 28px -10px rgba(99, 102, 241, 0.7);
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 36px -12px rgba(139, 92, 246, 0.75);
    }
    .btn-secondary {
      color: var(--indigo);
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
    .btn-secondary:hover {
      transform: translateY(-2px);
      background: rgba(99, 102, 241, 0.14);
    }
    .sign {
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
      font-size: 13px;
      color: #64748b;
      text-align: center;
    }
    .sign a {
      color: var(--violet);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.18s ease;
    }
    .sign a:hover { color: var(--pink); }
    @media (max-width: 480px) {
      .container { padding: 44px 24px 24px; border-radius: 22px; }
      .links a { padding: 11px 18px; font-size: 13px; }
    }
    @media (prefers-reduced-motion: reduce) {
      body::before, body::after, .badge .dot, .typing span { animation: none; }
    }
  </style>
</head>
<body>
  <main class="container" role="main">
    <div class="badge">
      <span class="dot" aria-hidden="true"></span>
      API Online
    </div>

    <h1>Chat App API</h1>

    <div class="typing" aria-label="Real-time messaging" role="img">
      <span></span><span></span><span></span>
    </div>

    <p class="version">v${version}</p>

    <p class="lead">
      Production-grade real-time messaging backend powered by
      <strong>Express 5</strong>, <strong>MongoDB</strong>, and
      <strong>Socket.io</strong> — with JWT auth, Cloudinary uploads, and a
      hardened admin moderation surface.
    </p>

    <nav class="links" aria-label="Useful endpoints">
      <a href="/api-docs" class="btn-primary">API Documentation</a>
      <a href="/api/health" class="btn-secondary">Health Check</a>
    </nav>

    <footer class="sign">
      Created by
      <a href="https://serkanbayraktar.com/" target="_blank" rel="noopener noreferrer">Serkanby</a>
      |
      <a href="https://github.com/Serkanbyx" target="_blank" rel="noopener noreferrer">Github</a>
    </footer>
  </main>
</body>
</html>`;

