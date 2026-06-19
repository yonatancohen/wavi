# Wavi — WhatsApp AI Group Agent

## Monorepo Structure

```
wavi/
├── apps/
│   ├── api/          Node.js + Fastify backend
│   └── dashboard/    Vue 3 + Vite frontend
├── packages/
│   └── shared/       TypeScript types shared between both
├── supabase-schema.sql
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js >= 20
- bun >= 1.1 (`# bun is the package manager`)
- Supabase project (free tier)
- Anthropic API key
- OpenAI API key (embeddings only)
- Upstash Redis (free tier)

## Setup

### 1. Install dependencies
```bash
bun install
```

### 2. Database
- Open Supabase SQL Editor
- Run `supabase-schema.sql` in full
- Enable pgvector extension (Settings → Database → Extensions)

### 3. Environment variables

**API** (`apps/api/.env`):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PORT=3000
WA_AGENT_NAME=Wavi
AGENT_ID=<your agent row UUID from Supabase>
```

**Dashboard** (`apps/dashboard/.env`):
```
VITE_API_URL=http://localhost:3000/api
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### 4. Create agent row in Supabase
```sql
INSERT INTO owners (email) VALUES ('you@example.com') RETURNING id;
INSERT INTO agents (owner_id, agent_name) VALUES ('<owner_id>', 'Wavi') RETURNING id;
-- Copy the agent id into AGENT_ID env var
```

### 5. Run dev servers
```bash
bun run dev
# API:       http://localhost:3000
# Dashboard: http://localhost:5173
```

### 6. Connect WhatsApp
- Open dashboard → WhatsApp tab
- Scan QR code with your phone
- Add the agent number to a WhatsApp group

### 7. Upload group history
- Export WhatsApp chat: Settings → Chat → Export Chat (without media)
- Dashboard → Groups → select group → Upload History
- Wait for character synthesis (~60 seconds for 5k messages)
- Review character card → Go Live

## Build Sequence (Phase by Phase)

| Phase | Goal |
|-------|------|
| 0 | Foundation — schema, scaffold, auth |
| 1 | WhatsApp core — connect, store messages, detect tags |
| 2 | Ingestion + RAG — upload history, embed, pgvector |
| 3 | Character synthesis — generate + review flow |
| 4 | AI replies — full 8-block RAG prompt |
| 5 | Intelligence jobs — profiling, relationships, context |
| 6 | Recovery — negative reactions, apology |
| 7 | Dashboard + polish — full UI, memory manager |

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

- **API → Railway** (`apps/api`) — attach a volume at `/data` for WhatsApp session
- **Dashboard → Vercel** (`apps/dashboard`)
- Dev and prod share the same Supabase + Redis for now

## Cost (personal scale)
~$2–5/month. See spec for full breakdown.
