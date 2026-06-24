import { isAuthRequired, useAuthStore } from '../stores/auth';

const allowedOwnerEmail = import.meta.env.VITE_ALLOWED_OWNER_EMAIL?.trim() || '(unset)';

export function logApiAuthContext(path: string): void {
  if (!import.meta.env.DEV || !isAuthRequired) return;

  const auth = useAuthStore();
  console.info(`[Wavi auth] → ${path}`, {
    viteAuthRequired: import.meta.env.VITE_AUTH_REQUIRED,
    allowedOwnerEmail,
    userEmail: auth.userEmail ?? '(none)',
    isAuthenticated: auth.isAuthenticated,
    hasAccessToken: !!auth.accessToken,
    willSendBearer: !!auth.accessToken,
  });
}

export function logApiAuthFailure(path: string, status: number, body: unknown): void {
  if (!import.meta.env.DEV || status !== 401) return;

  const auth = useAuthStore();
  console.warn(`[Wavi auth] ← 401 ${path}`, {
    response: body,
    client: {
      allowedOwnerEmail,
      userEmail: auth.userEmail ?? '(none)',
      isAuthenticated: auth.isAuthenticated,
      hasAccessToken: !!auth.accessToken,
    },
  });
}
