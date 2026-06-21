const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function parseOriginList(raw?: string): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '')
}

export function isVercelAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')
  } catch {
    return false
  }
}

export function allowedDashboardOrigins(): string[] {
  const origins = new Set(LOCAL_ORIGINS)
  for (const origin of parseOriginList(process.env.DASHBOARD_URL)) origins.add(origin)
  for (const origin of parseOriginList(process.env.CORS_ORIGINS)) origins.add(origin)
  return [...origins]
}

/** Whether a browser Origin header may call the API with credentials. */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true

  const normalized = normalizeOrigin(origin)
  if (allowedDashboardOrigins().includes(normalized)) return true

  // Dashboard is on Vercel — allow prod + preview deploy URLs (DASHBOARD_URL is often stale).
  if (process.env.NODE_ENV === 'production' && isVercelAppOrigin(normalized)) return true

  return false
}

export function pickDashboardOrigin(requestOrigin?: string): string {
  const origin = requestOrigin ? normalizeOrigin(requestOrigin) : undefined
  if (origin && isOriginAllowed(origin)) return origin

  const allowed = allowedDashboardOrigins()
  const configured = allowed.find((o) => !LOCAL_ORIGINS.includes(o))
  return configured ?? LOCAL_ORIGINS[0]
}
