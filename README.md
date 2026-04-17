# Chat App (MERN + Socket.io)

> Production-grade real-time chat application built on the MERN stack with Socket.io.
> Full documentation will be added in **STEP 36** (see `STEPS.md`).

## Stack

- **Frontend:** React 19, Vite, TailwindCSS v4, React Router v7, Axios, Socket.io-client
- **Backend:** Node.js, Express 5, MongoDB / Mongoose 9, Socket.io 4, JWT, Cloudinary

## Monorepo Layout

```
.
├── server/   # Express 5 + Socket.io API
└── client/   # React 19 + Vite SPA
```

## Quick Start (development)

```bash
# Backend
cd server
npm install
cp .env.example .env
npm run dev

# Frontend (in a second terminal)
cd client
npm install
cp .env.example .env
npm run dev
```

> Detailed setup, architecture diagram and deployment guide will be documented in STEP 36.
