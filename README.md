# Ilays Schools — School ERP

Multi-school ERP platform for Ilays Organization. Monorepo: Next.js (`apps/web`), NestJS (`apps/api`), Prisma (`packages/database`).

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable` or `npm i -g pnpm`)
- Docker Desktop

## First-time setup

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env

docker compose up -d

pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

> Ports for Postgres/Redis/MinIO are remapped from their defaults (5433, 6380, 9010/9011) because another local Docker project on this machine already occupies 5432/6379/9000-9001. If that's not the case on your machine, feel free to remap back in `docker-compose.yml` + the `.env` files.

## Running in development

```bash
pnpm dev
```

- Web: http://localhost:3010
- API: http://localhost:4000/api/v1
- API health check (verifies Postgres + Redis): http://localhost:4000/api/v1/health
- MinIO console (local S3/R2 emulator): http://localhost:9011 (user: `erp_minio` / password: `erp_minio_secret`)

## Project layout

```
apps/web        Next.js — all portals (super admin, school admin, teacher, student, parent)
apps/api        NestJS — REST API, one module per domain area
packages/database  Prisma schema, migrations, seed — single source of truth for the data model
```

## Status

Phase 0 (foundation) in progress — see the architecture blueprint artifact shared in chat for the full plan and phased roadmap.
