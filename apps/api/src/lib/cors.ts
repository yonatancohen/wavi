const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

export function allowedDashboardOrigins(): string[] {
  const origins = new Set(LOCAL_ORIGINS)
  if (process.env.DASHBOARD_URL) origins.add(process.env.DASHBOARD_URL)
  return [...origins]
}

export function pickDashboardOrigin(requestOrigin?: string): string {
  const allowed = allowedDashboardOrigins()
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin
  return process.env.DASHBOARD_URL ?? LOCAL_ORIGINS[0]
}
