import { useAuthStore, isAuthRequired } from '../stores/auth';
import router from './router';
import { logApiAuthContext, logApiAuthFailure } from './auth-debug';

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const BASE = API_BASE;

function authHeaders(): Record<string, string> {
  const auth = useAuthStore();
  return auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {};
}

/** EventSource URL with ?token= when auth is enabled (no custom headers supported). */
export function buildEventSourceUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_BASE}${normalized}`, window.location.href);
  const auth = useAuthStore();
  if (auth.accessToken) url.searchParams.set('token', auth.accessToken);
  return url.toString();
}

/** Open an authenticated SSE stream (EventSource cannot send Authorization headers). */
export async function openEventSource(path: string): Promise<EventSource> {
  const auth = useAuthStore();
  if (isAuthRequired) {
    await auth.init();
    if (!auth.accessToken) {
      throw new Error('Session expired — sign in again');
    }
  }
  return new EventSource(buildEventSourceUrl(path));
}

let handlingUnauthorized = false;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Fastify rejects Content-Type: application/json with an empty body.
  if (init?.body != null && !isFormData && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json';
  }

  Object.assign(headers, authHeaders());

  const sentAuth = 'Authorization' in headers;

  logApiAuthContext(path);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401 && isAuthRequired && sentAuth && !handlingUnauthorized) {
      handlingUnauthorized = true;
      try {
        const auth = useAuthStore();
        await auth.signOut();
        if (router.currentRoute.value.path !== '/login') {
          await router.replace({
            path: '/login',
            query: { redirect: router.currentRoute.value.fullPath },
          });
        }
      } finally {
        handlingUnauthorized = false;
      }
    }
    const body = await res.json().catch(() => null);
    logApiAuthFailure(path, res.status, body);
    const message = body?.error ?? body?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}
