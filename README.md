# Wavi — WhatsApp AI Group Agent

## Monorepo Structure

```
wavi/
├── apps/
│   ├── api/          Bun + Fastify backend
│   └── dashboard/    Vue 3 + Vite frontend
├── packages/
│   └── shared/       TypeScript types shared between both
├── supabase-schema.sql
└── bunfig.toml
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.4.0 (`curl -fsSL https://bun.sh/install | bash`)
- Supabase project (free tier works)
- Anthropic API key
- OpenAI API key (embeddings only)
- Upstash Redis (free tier works)

## Setup

### 1. Bootstrap

```bash
bun run setup      # checks Bun/git, copies .env.example files, runs bun install
```

Or manually:

```bash
bun install
```

### 2. Database

- Open Supabase SQL Editor
- Run `supabase-schema.sql` in full
- Enable pgvector extension (Settings → Database → Extensions)

### 3. Environment variables

**API** (`apps/api/.env`) — see `apps/api/.env.example` for the full annotated list:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PORT=3000
NODE_ENV=development
ALLOWED_OWNER_EMAIL=you@gmail.com
WA_AGENT_NAME=wavi
AGENT_ID=<your agent row UUID from Supabase>
DASHBOARD_URL=https://your-app.vercel.app
# Optional: TAVILY_API_KEY for per-group web search
```

**Dashboard** (`apps/dashboard/.env`) — see `apps/dashboard/.env.example` for the full annotated list:

```
VITE_API_URL=http://localhost:3000/api
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ALLOWED_OWNER_EMAIL=you@gmail.com
VITE_AUTH_REQUIRED=false   # set to true once OAuth is configured (matches API AUTH_REQUIRED)
```

### 4. Create agent row in Supabase

```bash
bun run db:setup   # creates owner + agent rows and writes AGENT_ID into apps/api/.env
```

Or manually via SQL:

```sql
INSERT INTO owners (email) VALUES ('you@example.com') RETURNING id;
INSERT INTO agents (owner_id, agent_name) VALUES ('<owner_id>', 'wavi') RETURNING id;
-- Copy the agent id into AGENT_ID in apps/api/.env
```

### 5. Configure Google OAuth (for dashboard login)

```bash
bun run auth:setup   # configures Supabase Google OAuth + redirect URLs
```

See `docs/AUTH.md` for the full walk-through. You can skip this step locally by setting `VITE_AUTH_REQUIRED=false` in the dashboard env.

### 6. Run dev servers

See **[docs/COMMANDS.md](docs/COMMANDS.md)** for all scripts.

```bash
bun run dev
# API:       http://localhost:3000
# Dashboard: http://localhost:5173
```

### 7. Connect WhatsApp

- Open dashboard → WhatsApp tab
- Scan QR code with your phone
- Add the agent number to a WhatsApp group

### 8. Upload group history

- Export WhatsApp chat: Settings → Chat → Export Chat (without media)
- Dashboard → Groups → select group → Upload History
- Wait for character synthesis (~60 seconds for 5k messages)
- Review character card → Go Live

## Deployment

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for full instructions.

Quick start:

```bash
railway login && vercel login
cd apps/api && railway init --name wavi-api   # first time only (creates project)
cd ../dashboard && vercel link && cd ../..
bun run sync-secrets      # push .env → Railway + Vercel
bun run deploy:prod       # deploy API + dashboard
```

- **API → Railway** — 1 vCPU / 1 GB RAM, one replica, 1 GB volume at `/data` (see `docs/DEPLOY.md`)
- **Dashboard → Vercel** (`apps/dashboard`)
- Dev and prod share the same Supabase + Redis for now

## Cost (personal scale)

~$2–5/month. See `docs/SPEC.md` for full breakdown.
