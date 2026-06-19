export const API_BASE = import.meta.env.VITE_API_URL ?? '/api'
const BASE = API_BASE

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData
  const headers = isFormData
    ? { ...init?.headers }
    : { 'Content-Type': 'application/json', ...init?.headers }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error ?? body?.message ?? `Request failed (${res.status})`
    throw new Error(message)
  }
  return res.json()
}
