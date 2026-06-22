# AGENTS.md

Guidance for AI coding agents working in this repo. Keep this file in sync when conventions change.

## What Wavi is

Wavi is a configurable AI agent that lives inside WhatsApp group chats. It ingests a group's history, synthesizes a "character" that fits the group, and replies in-character when tagged. The architecture is RAG-based: history is chunked + embedded into pgvector, and each reply is built from an 8-block context prompt. See `docs/SPEC.md` for the full product spec and `README.md` for setup.

## Tech stack

- **Runtime / package manager:** [Bun](https://bun.sh) (`>=1.4.0`). Bun runs TypeScript natively and loads `.env` automatically — no `dotenv`, no build step for the server.
- **Monorepo:** Bun workspaces (`apps/*`, `packages/*`).
- **API:** Node-style + Fastify 4, TypeScript ESM (`apps/api`).
- **Dashboard:** Vue 3 + Vite + Pinia + vue-router + vue-i18n + Tailwind (`apps/dashboard`).
- **Shared types:** `packages/shared` (`@wavi/shared`).
- **Data:** Supabase (Postgres + pgvector), Upstash Redis (queue + ephemeral state).
- **AI:** Anthropic Claude (replies + character synthesis), OpenAI (embeddings only).
- **WhatsApp:** `whatsapp-web.js` (default) or Baileys, selected at runtime via `WA_PROVIDER`. Twilio is an optional DM path.
- **Deploy:** API → Railway (Dockerfile from repo root), Dashboard → Vercel. See `docs/DEPLOY.md`.

## Repo layout

```
apps/
  api/            Fastify backend
    src/
      index.ts        server bootstrap, plugin + route registration, process guards
      routes/         HTTP routes (one file per resource, registered with a prefix)
      whatsapp/        provider-agnostic WA layer (client.ts dispatches by WA_PROVIDER)
        provider.ts      WhatsAppProvider interface + shared message types
        providers/       wwebjs.ts, baileys.ts implementations
      twilio/         optional Twilio DM path
      ai/             prompt building, worker, synthesis, profiling, relationships, recovery
      jobs/           background jobs (chunker, etc.)
      lib/            redis, embeddings, parser, reply-queue, reply-flows, cors
      db/             Supabase client
  dashboard/      Vue 3 frontend
    src/
      views/        route-level pages
      components/    UI components (grouped by feature)
      stores/        Pinia stores
      composables/   shared reactive logic
      lib/          api client, router, helpers
      locales/      i18n JSON (en/he/...)
packages/shared/  shared TS types (@wavi/shared)
scripts/          bash scripts for dev, db, deploy, secrets, health
docs/             SPEC.md, DEPLOY.md
supabase-schema.sql   full DB schema (run in Supabase SQL editor)
```

## Commands

Run from repo root unless noted. Bun is the package manager — never use `npm`/`yarn`/`pnpm`.

```bash
bun install              # install all workspaces
bun run dev              # API + dashboard together (scripts/dev.sh)
bun run dev:api          # API only
bun run dev:dashboard    # dashboard only
bun run typecheck        # tsc/vue-tsc across all workspaces
bun run test             # API test suite (bun test)
bun run build            # build all workspaces
```

Targeted checks while iterating:

```bash
bun run --filter '@wavi/api' typecheck
bun run --filter '@wavi/api' test
cd apps/api && bun test src/ai/__tests__/recovery.test.ts   # single test file
```

DB / deploy (see `docs/DEPLOY.md` before using):

```bash
bun run db:setup         # create owner/agent rows, writes AGENT_ID into apps/api/.env
bun run sync-secrets     # push local .env → Railway + Vercel
bun run deploy:prod      # full production deploy
bun run health           # health check
```

## Conventions

- **TypeScript ESM, strict mode.** API imports use explicit `.js` extensions on relative paths (e.g. `import { db } from './db/client.js'`) — this is required for ESM resolution even though the source is `.ts`. Match this in new files.
- **Shared types live in `@wavi/shared`.** Don't redefine DB row shapes locally; add or reuse types there.
- **WhatsApp work goes through the provider abstraction.** Add capabilities to the `WhatsAppProvider` interface in `whatsapp/provider.ts` and implement in both `wwebjs.ts` and `baileys.ts`. App code talks to `whatsapp/client.ts`, never a provider directly.
- **Routes:** one file per resource in `apps/api/src/routes`, exported as a Fastify plugin and registered with a prefix in `index.ts`.
- **Async work is queued through Redis.** Replies are enqueued and processed by the worker loop in `ai/worker.ts`; ephemeral state (pending reactions, etc.) uses keyed Redis entries with TTLs. Use `SCAN`, never `KEYS`.
- **Tests:** `bun:test` (`describe`/`it`/`expect`), colocated in `__tests__/` folders next to the code. Add tests for parser/prompt/recovery-style pure logic.
- **Comments** in this codebase explain *why* (non-obvious races, constraints, trade-offs), not *what*. Follow that — don't add narrating comments.
- **Dashboard:** Vue 3 `<script setup>`, Pinia for state, Tailwind for styling, all API calls via `apiFetch` in `src/lib/api.ts`. User-facing strings go through i18n (`src/locales`).

## Environment & secrets

- Local `.env` files are the source of truth; deploy scripts push them to Railway/Vercel. **Never commit `.env` files** (gitignored).
- API env lives in `apps/api/.env`, dashboard in `apps/dashboard/.env`. Required keys are documented in `README.md` and `docs/DEPLOY.md`.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — API only, never expose to the frontend. The dashboard only uses the anon key.
- Don't print or commit secret values when debugging.

## Before you finish

- Run `bun run typecheck` and the relevant tests for code you touched.
- Fix any linter/type errors you introduce.
- Don't commit unless the user asks.
