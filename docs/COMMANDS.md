# Commands reference

All `bun run …` scripts from the repo root unless noted. Bun is the only package manager — do not use npm/yarn/pnpm.

Workspace-specific scripts can also be run with filters, e.g. `bun run --filter '@wavi/api' test`.

---

## Development

| Command                 | What it does                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `bun install`           | Install dependencies for all workspaces (`apps/*`, `packages/*`).                         |
| `bun run dev`           | Start **API + dashboard** together via `scripts/dev.sh` (API `:3000`, dashboard `:5173`). |
| `bun run dev:api`       | Start the Fastify API only (`bun --watch src/index.ts` in `apps/api`).                    |
| `bun run dev:dashboard` | Start the Vite dev server only (`apps/dashboard`, proxies `/api` → `:3000`).              |
| `bun run setup`         | First-time bootstrap: check Bun/git, copy `.env.example` files if missing, `bun install`. |

---

## Quality checks

| Command                | What it does                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `bun run typecheck`    | Type-check all workspaces (`tsc` / `vue-tsc`).                                                |
| `bun run test`         | Run the API test suite (`bun test` in `apps/api`).                                            |
| `bun run test:parser`  | Run the WhatsApp `.txt` export parser smoke script (`scripts/test-parser.mjs`).               |
| `bun run lint`         | ESLint across the repo (TS + Vue).                                                            |
| `bun run lint:fix`     | ESLint with autofix.                                                                          |
| `bun run format`       | Prettier write (formats all matched files).                                                   |
| `bun run format:check` | Prettier check only — CI-friendly, no writes.                                                 |
| `bun run build`        | Build all workspaces (dashboard production bundle; shared types bundle; API is a no-op echo). |

### Targeted (single workspace)

```bash
bun run --filter '@wavi/api' typecheck
bun run --filter '@wavi/api' test
bun run --filter '@wavi/dashboard' typecheck
bun run --filter '@wavi/shared' build    # rebuild dist/ after changing shared types
cd apps/api && bun test src/ai/__tests__/recovery.test.ts   # one test file
```

---

## AI / debugging

| Command          | What it does                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run replay` | Offline reply harness — builds the full prompt and optionally calls Claude **without** sending WhatsApp. Requires `apps/api/.env` (Supabase + Anthropic). |

Examples:

```bash
bun run replay -- --fixtures
bun run replay -- <groupId> --sender "Yoni Cohen" --message "@wavi מי זה Dan Cohen? וואו"
```

See `apps/api/scripts/replay.ts`, `apps/api/scripts/replay-fixtures.json`, and [HOW-WAVI-WORKS.md](./HOW-WAVI-WORKS.md) (also in the dashboard under **How It Works**).

---

## Database

| Command            | What it does                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run db:setup` | Create owner/agent rows in Supabase and write `AGENT_ID` into `apps/api/.env`. Run `supabase-schema.sql` in the Supabase SQL editor first. |
| `bun run db:reset` | **Destructive** — wipe Wavi data for the configured Supabase project (see script before running).                                          |

---

## Deploy & secrets

See [DEPLOY.md](./DEPLOY.md) before using these in production.

| Command                          | What it does                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `bun run sync-secrets`           | Push local `.env` values → Railway (API) + Vercel (dashboard).                |
| `bun run sync-secrets:api`       | Sync API env to Railway only.                                                 |
| `bun run sync-secrets:dashboard` | Sync dashboard env to Vercel only.                                            |
| `bun run preflight`              | Pre-deploy checklist: env files, Railway/Vercel links, resolved URLs.         |
| `bun run deploy`                 | Full deploy: sync secrets → API (Railway) → dashboard (Vercel), preview mode. |
| `bun run deploy:prod`            | Same as `deploy`, production targets.                                         |
| `bun run deploy:quick`           | Deploy **without** syncing secrets (assumes env is already up to date).       |
| `bun run deploy:quick:prod`      | Quick deploy, production.                                                     |
| `bun run deploy:quick:api`       | Quick deploy API only.                                                        |
| `bun run deploy:quick:dash`      | Quick deploy dashboard only.                                                  |
| `bun run deploy:api`             | Deploy API to Railway (includes secret sync).                                 |
| `bun run deploy:env`             | Push env vars to Railway only (no code deploy).                               |
| `bun run deploy:dashboard`       | Deploy dashboard to Vercel (preview).                                         |
| `bun run deploy:dashboard:prod`  | Deploy dashboard to Vercel production.                                        |

---

## Operations

| Command               | What it does                                                                          |
| --------------------- | ------------------------------------------------------------------------------------- |
| `bun run health`      | Smoke-check local services: API, Supabase, Redis, Anthropic, OpenAI, WhatsApp status. |
| `bun run health:prod` | Same checks against production URLs from env / Railway.                               |
| `bun run logs`        | Tail Railway API logs (requires Railway CLI + linked project).                        |

---

## Workspace scripts (usually via root or `--filter`)

### `@wavi/api` (`apps/api`)

| Script       | What it does                                      |
| ------------ | ------------------------------------------------- |
| `dev`        | `bun --watch src/index.ts` — API with hot reload. |
| `start`      | `bun src/index.ts` — run once (production-style). |
| `typecheck`  | `tsc --noEmit`.                                   |
| `test`       | `bun test` — all API tests.                       |
| `test:watch` | `bun test --watch`.                               |
| `replay`     | Same as root `bun run replay`.                    |
| `build`      | No-op placeholder (Bun runs TS natively).         |

### `@wavi/dashboard` (`apps/dashboard`)

| Script      | What it does                        |
| ----------- | ----------------------------------- |
| `dev`       | Vite dev server on `:5173`.         |
| `build`     | `vue-tsc` + Vite production build.  |
| `preview`   | Serve the production build locally. |
| `typecheck` | `vue-tsc --noEmit`.                 |

### `@wavi/shared` (`packages/shared`)

| Script      | What it does                                                                        |
| ----------- | ----------------------------------------------------------------------------------- |
| `build`     | Bundle `src/index.ts` → `dist/` + emit `.d.ts` (run after changing shared exports). |
| `dev`       | Watch rebuild of shared bundle.                                                     |
| `typecheck` | `tsc --noEmit` on source.                                                           |
