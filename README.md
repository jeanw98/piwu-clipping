# PIWU Clipping

Production-oriented monorepo for authenticated short-form video clipping: NestJS API, Vite React studio, BullMQ workers, and Remotion 9:16 renders.

## Stack

- **apps/api** — NestJS, Prisma, PostgreSQL, Passport JWT, BullMQ, Remotion renderer
- **apps/web** — Vite + React + Tailwind + Shadcn-style UI + TanStack Query + Remotion Player
- **packages/shared** — Zod schemas, enums, and shared DTOs

## Prerequisites

- Node.js 18+
- pnpm 9 (`corepack enable`)
- Docker (Postgres + Redis)
- FFmpeg installed on the host (required by Remotion / fluent-ffmpeg)

```bash
# macOS
brew install ffmpeg
```

## Quick start (local dev)

```bash
# 1) Infrastructure only (Postgres + Redis volumes)
docker compose up -d postgres redis

# 2) Install
pnpm install

# 3) Env
cp .env.example .env
cp .env apps/api/.env
cp apps/web/.env.example apps/web/.env

# Fill real AI keys in apps/api/.env

# 4) Shared + DB
pnpm --filter @piwu/shared build
pnpm db:generate
pnpm db:push

# 5) Dev
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000 (change `PORT` if occupied)

## Docker (full stack)

Postgres data lives in the `postgres_data` volume. Redis uses `redis_data`.

```bash
cp .env.example .env   # fill AI + AWS keys
docker compose up -d --build
```

- Web: http://localhost:8080
- API: http://localhost:3000
- Postgres: `localhost:5432` (user/pass/db: `clipping` / `clipping` / `clipping_db`)

Downloads use signed S3 URLs when `STORAGE_DRIVER=s3`.

AI keys stay server-side only — the Vite app exposes `VITE_API_URL` / `VITE_WS_URL` exclusively.

## Pipeline

1. `POST /clips/generate` creates a `ClipJob` and enqueues `clipping-queue`
2. Claude → structured script/scenes
3. ElevenLabs TTS + OpenAI Whisper word timestamps
4. Prompt clips: Claude script review (optional style **Referencia** images) → approve → ElevenLabs / Leonardo / MiniMax Hailuo
5. YouTube clips: download → cut → Remotion (no Hailuo)
6. Remotion `renderMedia` → `1080×1920` H.264 @ 30fps
7. Socket.IO emits `job:progress` / `job:completed` / `job:failed`

### Video animation (MiniMax)

Default model: `MiniMax-Hailuo-2.3-Fast` at `768P` via `https://api.minimax.io`.

| Variable | Default | Notes |
|----------|---------|-------|
| `MINIMAX_API_KEY` | (empty) | Required for animated scenes |
| `MINIMAX_VIDEO_MODEL` | `MiniMax-Hailuo-2.3-Fast` | Economy: `MiniMax-Hailuo-02` |
| `MINIMAX_VIDEO_RESOLUTION` | `768P` | Economy: `512P` |
| `MINIMAX_VIDEO_TIMEOUT_MS` | `600000` | Poll timeout |

Runway is not used. If Hailuo fails, the scene keeps the Leonardo still.

## Storage

`STORAGE_DRIVER=local|s3` (default local).

- **local:** `apps/api/uploads/{audio,assets,renders}`
- **s3:** bucket `AWS_BUCKET` under prefix `S3_PREFIX` (default `piwu-clipping/`)

- `GET /storage/resolve?path=...` → signed S3 URL (or local proxy path)
- `GET /clips/:id/download` → download URL with `Content-Disposition` (AWS when S3)
- Legacy proxy: `GET /storage/{renders|assets|audio}/:filename` (redirects to S3 when configured)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run API + web via Turborepo |
| `pnpm build` | Build all packages |
| `pnpm db:generate` | Prisma client generate |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm db:push` | Prisma db push |
