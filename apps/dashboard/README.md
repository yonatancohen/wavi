# Wavi Dashboard

Vue 3 + Vite + Pinia + Tailwind frontend for the Wavi WhatsApp AI agent.

## Dev

```bash
# From repo root (runs API + dashboard together)
bun run dev

# Dashboard only
bun run dev:dashboard
```

Runs on `http://localhost:5173`. API calls proxy to `http://localhost:3000`.

## Build

```bash
bun run build           # type-check + production bundle
bun run preview         # serve the production build locally
bun run typecheck       # vue-tsc --noEmit only
```

## Environment

Copy `apps/dashboard/.env.example` → `apps/dashboard/.env` and fill in:

| Variable                   | Description                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| `VITE_API_URL`             | Backend API URL (`http://localhost:3000/api` for local dev)           |
| `VITE_SUPABASE_URL`        | Supabase project URL                                                  |
| `VITE_SUPABASE_ANON_KEY`   | Supabase anon key (public; never the service role key)                |
| `VITE_ALLOWED_OWNER_EMAIL` | Google account allowed to sign in (matches API `ALLOWED_OWNER_EMAIL`) |
| `VITE_AUTH_REQUIRED`       | Set `false` to skip login during local dev (before OAuth is set up)   |

Run `bun run auth:setup` from the repo root to configure Supabase Google OAuth and get the Supabase URL + anon key automatically written. See `docs/AUTH.md`.

## Structure

```
src/
├── views/          Route-level pages (one file per route)
├── components/     UI components (grouped by feature)
├── stores/         Pinia stores (groups, agent, replies, flows, auth)
├── composables/    Shared reactive logic
├── lib/            API client, router, markdown, i18n helpers
└── locales/        i18n JSON (en / he)
```

All API calls go through `src/lib/api.ts` (`apiFetch`). User-facing strings go through vue-i18n (`src/locales`).

## How It Works doc

The **How It Works** page in the dashboard renders `docs/HOW-WAVI-WORKS.md` — edit that file to update the in-app documentation.
