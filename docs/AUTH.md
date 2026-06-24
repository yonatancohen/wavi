# Dashboard authentication setup

The dashboard login screen uses **Supabase Auth** with **Google OAuth**. This guide walks through one-time configuration.

---

## What you need

| Item                  | Where to get it                                                                         |
| --------------------- | --------------------------------------------------------------------------------------- |
| Supabase project      | [supabase.com/dashboard](https://supabase.com/dashboard)                                |
| Supabase access token | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)                |
| Google OAuth client   | [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) |
| `SUPABASE_URL`        | Supabase → Settings → API (already in `apps/api/.env`)                                  |

---

## Quick setup (automated)

### 1. Google Cloud — create OAuth client

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. **Create credentials** → **OAuth client ID** → **Web application**
3. **Authorized JavaScript origins:**
   - `http://localhost:5173`
   - Your production dashboard URL (e.g. `https://wavi-fawn.vercel.app`)
4. **Authorized redirect URIs** (required — copy from your Supabase project):
   - `https://<project-ref>.supabase.co/auth/v1/callback`
5. Save the **Client ID** and **Client secret**

### 2. Add credentials to `apps/api/.env`

```env
SUPABASE_ACCESS_TOKEN=sbp_...
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
DASHBOARD_URL=https://your-app.vercel.app   # optional but recommended for prod redirects
```

### 3. Run the setup script

```bash
bun run auth:setup
```

This will:

- Enable Google provider on your Supabase project
- Set redirect URLs (`http://localhost:5173/**`, `https://**.vercel.app/**`, production `/login`)
- Copy `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into `apps/dashboard/.env`

### 4. Test locally

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) — you should be redirected to `/login`. Click **Continue with Google**.

**Local bypass:** If OAuth is not ready yet, add `VITE_AUTH_REQUIRED=false` to `apps/dashboard/.env` to skip login during development.

---

## Restrict to your Google account only

Wavi is single-owner. Set your Google email in both env files:

```env
# apps/api/.env
ALLOWED_OWNER_EMAIL=you@gmail.com

# apps/dashboard/.env
VITE_ALLOWED_OWNER_EMAIL=you@gmail.com
```

Anyone else who completes Google OAuth is signed out immediately and sees "Access denied." When `AUTH_REQUIRED=true`, the API also rejects their JWT.

Use the **exact email** on your Google account (check at [myaccount.google.com](https://myaccount.google.com)).

---

## Production hardening

After OAuth works end-to-end:

1. Set `AUTH_REQUIRED=true` in `apps/api/.env`
2. Set `VITE_AUTH_REQUIRED=true` in `apps/dashboard/.env`
3. Run `bun run sync-secrets:api`

---

## Verify in Supabase dashboard

- [Auth → Providers → Google](https://supabase.com/dashboard/project/_/auth/providers)
- [Auth → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration)

Redirect URLs should include:

- `http://localhost:5173/**`
- `https://**.vercel.app/**` (all Vercel preview + production deploys)
- `https://your-app.vercel.app/login` (production, optional explicit entry)

---

## Troubleshooting

| Symptom                             | Fix                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Redirected to Google then error     | Check Google redirect URI matches `https://<ref>.supabase.co/auth/v1/callback` exactly |
| Stuck on `/login` after Google      | Add `https://**.vercel.app/**` to Supabase URL Configuration (preview deploys)         |
| Preview deploy shows "Bad request"  | Run `bun run sync-secrets` so Vercel Preview has `VITE_API_URL` → Railway `/api`       |
| API returns 401 in production       | Set `AUTH_REQUIRED=true` only after OAuth works; ensure dashboard sends Bearer token   |
| `redirect_uri_mismatch` from Google | Re-check Authorized redirect URIs in Google Cloud Console                              |
