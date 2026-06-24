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

function isMisconfiguredApiBase(): boolean {
  if (typeof window === 'undefined') return false;
  if (!BASE.startsWith('/')) return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

async function readResponseBody(res: Response): Promise<{ json: unknown | null; text: string }> {
  const text = await res.text();
  if (!text) return { json: null, text: '' };
  try {
    return { json: JSON.parse(text) as unknown, text };
  } catch {
    return { json: null, text };
  }
}

function apiErrorMessage(status: number, body: unknown | null, rawText: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.error === 'string') return record.error;
    if (typeof record.message === 'string') return record.message;
  }

  const trimmed = rawText.trimStart();
  if (trimmed.startsWith('<!') || trimmed.includes('<html')) {
    return 'API misconfigured — this deployment is calling itself instead of Railway. Set VITE_API_URL for Preview on Vercel.';
  }

  if (status === 400 && (!body || rawText === '')) {
    return 'Bad request — API URL may be misconfigured for this Vercel preview deployment.';
  }

  return `Request failed (${status})`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMisconfiguredApiBase()) {
    throw new Error('API misconfigured — set VITE_API_URL to your Railway API (/api) for this deployment.');
  }

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
  const { json: body, text } = await readResponseBody(res);

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
    logApiAuthFailure(path, res.status, body);
    throw new Error(apiErrorMessage(res.status, body, text));
  }

  if (body == null) {
    throw new Error('API returned an empty response.');
  }

  return body as T;
}
