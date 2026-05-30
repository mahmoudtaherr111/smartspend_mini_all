# SmartSpend — Architecture & Deployment Guide

## Overview

SmartSpend is structured as a **monorepo** with a **clean separation** between frontend and backend.
You can run them together (development) or deploy them independently (production).

```
smartspend_V1_fixed/
├── api/            ← Backend (Hono + tRPC + Drizzle ORM)
│   ├── boot.ts         ← Monorepo entry (Vite dev-server plugin mode)
│   ├── server.ts       ← Standalone backend entry (separate deploy)
│   ├── router.ts       ← tRPC app router (all sub-routers merged here)
│   ├── middleware.ts   ← Auth middleware & tRPC init
│   ├── context.ts      ← Request context (user extraction from JWT)
│   ├── lib/            ← AI classification, env, helpers
│   ├── services/       ← User profile, lifestyle engine, personalization
│   └── queries/        ← DB connection pool
├── src/            ← Frontend (React + Vite + tRPC client)
│   ├── providers/trpc.ts  ← tRPC client (reads VITE_API_URL)
│   ├── components/     ← UI components
│   ├── pages/          ← Route pages
│   └── hooks/          ← React hooks
├── db/             ← Shared: Drizzle schema + migrations
├── contracts/      ← Shared: Types, error codes, constants
└── .env            ← Environment variables
```

---

## 🛠️ Mode 1 — Monorepo Dev (Default)

Both frontend and backend run together on **port 3000**.
The Vite dev-server plugin proxies API calls to the embedded Hono server.

```bash
# Install dependencies
npm install

# Start dev server (frontend + backend together)
npm run dev
# → http://localhost:3000
```

**Required `.env` variables:**

```env
DATABASE_URL=mysql://root:@localhost:3306/smartspend
GEMINI_API_KEY=your_key
JWT_SECRET=your_secret_min_32_chars
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APP_URL=http://localhost:3000
NODE_ENV=development
PORT=3000
```

---

## 🚀 Mode 2 — Separate Backend + Frontend Deployment

### Backend Server

The backend runs as a **pure API server** on any port/host.

```bash
# Development with hot-reload
npm run backend:dev
# → http://localhost:3000 (API only, no frontend)

# Build for production
npm run backend:build

# Run production build
npm run backend:start
```

**Backend `.env` variables:**

```env
DATABASE_URL=mysql://user:pass@db-host:3306/smartspend
GEMINI_API_KEY=your_key
JWT_SECRET=your_secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.yoursite.com/api/auth/google/callback
APP_URL=https://api.yoursite.com
FRONTEND_URL=https://app.yoursite.com   ← SET THIS for CORS!
NODE_ENV=production
PORT=3000
```

### Frontend

The frontend is a **pure static React SPA** that talks to the backend via `VITE_API_URL`.

```bash
# Copy the example env and fill in your backend URL
cp .env.frontend.example .env.local
# Edit .env.local:
# VITE_API_URL=https://api.yoursite.com

# Dev mode (frontend only, proxies API to VITE_API_URL)
npm run frontend:dev
# → http://localhost:5173

# Build static files for deployment (Vercel / Netlify / S3)
npm run frontend:build
# Output: dist/public/
```

**Frontend `.env.local` variables:**

```env
VITE_API_URL=https://api.yoursite.com
```

---

## 🗄️ Database

```bash
# Push schema to database (creates/alters tables)
npm run db:push

# Generate migration files
npm run db:generate

# Apply migrations
npm run db:migrate
```

---

## 🌐 API Endpoints

All API calls go through tRPC at `/api/trpc/*`.

| Endpoint                        | Description                    |
| ------------------------------- | ------------------------------ |
| `GET /health`                   | Health check + allowed origins |
| `GET /api/auth/google/callback` | Google OAuth callback          |
| `POST /api/trpc/*`              | tRPC batch endpoint            |

---

## 📦 Production Build (Monorepo — Single Server)

```bash
npm run build
# Outputs:
#   dist/public/   ← Frontend static files (served by Hono)
#   dist/boot.js   ← Backend bundle (serves both API + static files)

npm run start
# → http://localhost:3000 (serves everything)
```

---

## 🔧 Deployment Platforms

### Backend (API Server)

- **Railway** / **Render** / **Fly.io**: Deploy with `npm run backend:start`
- **VPS**: Build with `npm run backend:build`, then run `node dist/server/server.js`
- **Docker**: Use the existing `Dockerfile`

### Frontend (Static)

- **Vercel**: Set `VITE_API_URL` in project settings, build command: `npm run frontend:build`
- **Netlify**: Same as Vercel
- **S3 + CloudFront**: Upload `dist/public/` folder

### Monorepo (Both Together)

- **Railway** / **Render**: Use `npm run build && npm run start`
- **Docker**: Existing `Dockerfile` works as-is
