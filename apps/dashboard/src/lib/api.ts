import { useAuthStore, isAuthDisabled } from '../stores/auth';

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const BASE = API_BASE;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Fastify rejects Content-Type: application/json with an empty body.
  if (init?.body != null && !isFormData && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!isAuthDisabled) {
    const auth = useAuthStore();
    if (auth.accessToken) {
      headers.Authorization = `Bearer ${auth.accessToken}`;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401 && !isAuthDisabled) {
      const auth = useAuthStore();
      await auth.signOut();
      window.location.assign('/login');
    }
    const body = await res.json().catch(() => null);
    const message = body?.error ?? body?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}
