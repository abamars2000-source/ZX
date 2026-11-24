# Installation Guide — ZX

## Prerequisites

- **Node.js** v20.x or v22.x (Node 22+ includes built-in `node:sqlite`)
- **npm** v10+

## Local Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Optional admin secret:
   - Set `ADMIN_BOOTSTRAP_SECRET` in `.env` (or leave empty to claim first-owner admin via `/admin` in the UI).

3. **Run in development mode** (Express + WebSockets + Vite on port `3000`):
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

4. **Database initialization**:
   On startup, `server/db.ts` initializes `zx_platform.db` with all 28+ tables and **zero pre-seeded rows**.

5. **Production build & start**:
   ```bash
   npm run build
   npm start
   ```
