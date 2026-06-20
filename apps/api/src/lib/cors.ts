const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function dashboardOrigin(): string | undefined {
  const url = process.env.DASHBOARD_URL?.trim()
  return url ? url.replace(/\/$/, '') : undefined
}

export function allowedDashboardOrigins(): string[] {
  const origins = new Set(LOCAL_ORIGINS)
  const dashboard = dashboardOrigin()
  if (dashboard) origins.add(dashboard)
  return [...origins]
}

export function pickDashboardOrigin(requestOrigin?: string): string {
  const allowed = allowedDashboardOrigins()
  const origin = requestOrigin?.trim()
  if (origin && allowed.includes(origin)) return origin
  return dashboardOrigin() ?? LOCAL_ORIGINS[0]
}
