# Deployment

Wavi runs in two places:

| Service   | Platform                       | Secrets store     |
| --------- | ------------------------------ | ----------------- |
| API       | [Railway](https://railway.app) | Railway variables |
| Dashboard | [Vercel](https://vercel.com)   | Vercel env vars   |

**Dev and prod share the same Supabase database and Upstash Redis** for now. Local `.env` files are the source of truth; deploy scripts push those values to Railway/Vercel.

---

## One-time setup

### 1. Install CLIs and log in

```bash
bun add -g @railway/cli vercel
railway login
vercel login
```

### 2. Fill local env files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
# Fill in Supabase, Redis, Anthropic, OpenAI, Twilio, etc.
```

### 3. Create DB rows (includes `AGENT_ID`)

```bash
./scripts/db-setup.sh
```

This writes `AGENT_ID` into `apps/api/.env`.

### 4. Link cloud projects

```bash
cd apps/api && railway init --name wavi-api   # first time only
cd ../dashboard && vercel link
cd ../..

# Deploy runs from repo root (Dockerfile) — do NOT `railway up` from apps/api
```

### 5. Railway service resources

One **always-on** API service (`wavi-api`). Do not run multiple replicas — one WhatsApp session per agent.

Production defaults (Baileys, ~2–5 groups):

| Setting      | Value    | Notes                                             |
| ------------ | -------- | ------------------------------------------------- |
| **Memory**   | **1 GB** | Headroom for history uploads and reconnect spikes |
| **vCPU**     | **1**    | Mostly I/O-bound (Redis, Supabase, Anthropic)     |
| **Replicas** | **1**    | Horizontal scaling breaks WhatsApp auth           |

Bump to **2 GB RAM** only if Railway logs show OOM kills or heavy concurrent ingestion. If you switch to `WA_PROVIDER=wwebjs` (Chromium), use **2 GB RAM + 1–2 vCPU** instead.

Set these under Railway → your API service → **Settings** → **Resources**.

### 6. Railway volume (WhatsApp session)

WhatsApp login must survive redeploys:

1. Railway → your API service → **Volumes**
2. Add a **1 GB** volume mounted at **`/data`**
3. Deploy scripts set `WA_BAILEYS_AUTH_PATH=/data/.baileys_auth` (default) and wwebjs paths under `/data` if you roll back provider

---

## Secrets reference

### API (`apps/api/.env` → Railway)

| Variable                    | Required | Notes                                      |
| --------------------------- | -------- | ------------------------------------------ |
| `SUPABASE_URL`              | yes      | Same project for dev + prod                |
| `SUPABASE_SERVICE_ROLE_KEY` | yes      | Server-only, never in dashboard            |
| `ANTHROPIC_API_KEY`         | yes      | Replies + synthesis                        |
| `OPENAI_API_KEY`            | yes      | Embeddings only                            |
| `UPSTASH_REDIS_REST_URL`    | yes      | Same Redis for dev + prod                  |
| `UPSTASH_REDIS_REST_TOKEN`  | yes      |                                            |
| `AGENT_ID`                  | yes      | UUID from `agents` table                   |
| `WA_AGENT_NAME`             | yes      | Default `wavi`                             |
| `DASHBOARD_URL`             | prod     | Set automatically after Vercel prod deploy |
| `TWILIO_*`                  | optional | Only for Twilio DM path                    |
| `PORT`                      | auto     | `3000` (set by sync script)                |
| `NODE_ENV`                  | auto     | `production`                               |

### Dashboard (`apps/dashboard/.env` → Vercel)

| Variable                 | Required | Notes                                  |
| ------------------------ | -------- | -------------------------------------- |
| `VITE_API_URL`           | yes      | `https://<railway-domain>/api` in prod |
| `VITE_SUPABASE_URL`      | yes      | Same as API                            |
| `VITE_SUPABASE_ANON_KEY` | yes      | Public anon key only                   |

---

## Deploy commands

```bash
# Push secrets only (no deploy)
bun run sync-secrets

# Push API secrets only
bun run sync-secrets:api

# Deploy API only
bun run deploy:api

# Deploy dashboard preview
bun run deploy:dashboard

# Full production deploy (API + dashboard + CORS wiring)
bun run deploy:prod

# Health check (local API URL from .env)
bun run health
bun run health:prod
```

### Recommended first production deploy

```bash
bun run deploy:prod
```

This will:

1. Sync all API secrets from `apps/api/.env` → Railway
2. Deploy API from `apps/api`
3. Set `VITE_API_URL` from the Railway domain
4. Sync dashboard secrets → Vercel
5. Deploy dashboard to production
6. Set `DASHBOARD_URL` on Railway for CORS

Then open the production dashboard → **WhatsApp** → scan QR.

---

## Troubleshooting

| Issue                                     | Fix                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| CORS / QR stream blocked                  | Ensure `DASHBOARD_URL` on Railway matches your Vercel URL exactly              |
| Groups page 500 `AGENT_ID not configured` | Run `./scripts/db-setup.sh`, then `bun run sync-secrets:api`                   |
| WhatsApp disconnects after deploy         | Attach Railway volume at `/data`                                               |
| Service OOM / restart loops               | Raise memory to 2 GB; keep 1 vCPU unless ingestion is constantly saturated     |
| Dashboard calls localhost API             | Set `VITE_API_URL` in `apps/dashboard/.env` to Railway URL, re-sync + redeploy |
| `railway login` / `vercel login` expired  | Re-authenticate and rerun deploy                                               |

---

## Security notes

- Never commit `.env` files (gitignored).
- Railway/Vercel hold production secrets — rotate keys there if leaked.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — API only, never frontend.
