import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';

// `swagger-jsdoc` reads JSDoc blocks at runtime; we resolve the routes folder
// from this file's location so the spec also works when the server is launched
// from outside the `server/` directory (e.g. PaaS root execution).
const require = createRequire(import.meta.url);
const { version, description } = require('../package.json');

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Chat App API',
    version,
    description:
      description ??
      'Production-grade real-time chat platform — REST surface for auth, conversations, messages, uploads, notifications, reports and admin moderation.',
    contact: {
      name: 'Serkanby',
      url: 'https://serkanbayraktar.com/',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'https://chat-app-mern-dm8x.onrender.com',
      description: 'Production (Render)',
    },
    {
      url: '/',
      description: 'Current host',
    },
    {
      url: 'http://localhost:5000',
      description: 'Local development',
    },
  ],
  tags: [
    { name: 'Auth', description: 'Registration, login, profile, password, account.' },
    { name: 'Users', description: 'Search, public profiles, preferences, blocking.' },
    { name: 'Conversations', description: 'Direct & group conversations, members, mute, archive, read.' },
    { name: 'Messages', description: 'Send / list / search / edit / delete / react.' },
    { name: 'Uploads', description: 'Cloudinary-backed avatar and message-image uploads.' },
    { name: 'Notifications', description: 'Per-user notifications and unread counts.' },
    { name: 'Reports', description: 'User-facing reporting endpoint.' },
    { name: 'Admin', description: 'Moderation surface — gated by `protect + adminOnly + adminLimiter`.' },
    { name: 'System', description: 'Health probe and meta endpoints.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT obtained from `POST /api/auth/login` or `POST /api/auth/register`.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: { type: 'object' },
            description: 'Field-level validation errors when applicable.',
          },
        },
      },
      Success: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: { type: 'object', nullable: true },
        },
      },
      AuthTokenResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '6630b5f1c2e9a3b1d4f8e201' },
          username: { type: 'string', example: 'serkan' },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          avatar: { type: 'string', nullable: true, example: 'https://res.cloudinary.com/.../avatar.webp' },
          role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
          status: { type: 'string', enum: ['active', 'suspended'], example: 'active' },
          preferences: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Conversation: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          type: { type: 'string', enum: ['direct', 'group'] },
          name: { type: 'string', nullable: true },
          members: {
            type: 'array',
            items: { type: 'string', description: 'User id' },
          },
          admins: {
            type: 'array',
            items: { type: 'string', description: 'User id' },
          },
          lastMessage: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          conversation: { type: 'string' },
          sender: { type: 'string' },
          type: { type: 'string', enum: ['text', 'image'] },
          content: { type: 'string' },
          imageUrl: { type: 'string', nullable: true },
          reactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                user: { type: 'string' },
                emoji: { type: 'string', example: '👍' },
              },
            },
          },
          editedAt: { type: 'string', format: 'date-time', nullable: true },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          user: { type: 'string' },
          type: { type: 'string', example: 'message' },
          payload: { type: 'object' },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const options = {
  definition: swaggerDefinition,
  apis: [
    path.join(serverRoot, 'routes', '*.js'),
    path.join(serverRoot, 'controllers', '*.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

export const swaggerUiOptions = {
  customSiteTitle: 'Chat App API — Docs',
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #6366f1; }
  `,
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'list',
    filter: true,
    tryItOutEnabled: true,
  },
};
