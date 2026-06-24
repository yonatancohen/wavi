import { useAuthStore, isAuthRequired } from '../stores/auth';
import router from './router';
import { logApiAuthContext, logApiAuthFailure } from './auth-debug';

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const BASE = API_BASE;

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

  const auth = useAuthStore();
  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

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
