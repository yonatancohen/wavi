/** Post-login destination; never send authenticated users back to /login. */
export function loginRedirectTarget(redirect: unknown): string {
  if (typeof redirect !== 'string' || !redirect.startsWith('/')) return '/';
  const path = redirect.split('?')[0] ?? redirect;
  if (path === '/login') return '/';
  return redirect;
}

/** True when the URL still carries a Supabase OAuth callback payload. */
export function hasAuthCallbackPayload(): boolean {
  const { hash, search } = window.location;
  if (hash.includes('access_token=') || hash.includes('error=')) return true;
  const params = new URLSearchParams(search);
  return params.has('code') || params.has('error') || params.has('error_description');
}

/** @deprecated Use hasAuthCallbackPayload */
export const hasAuthCallbackHash = hasAuthCallbackPayload;

/** Strip Supabase OAuth callback params from the URL so they are not re-processed on reload. */
export function clearAuthCallbackUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const hadQuery = params.has('code') || params.has('error') || params.has('error_description');
  if (hadQuery) {
    params.delete('code');
    params.delete('error');
    params.delete('error_description');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** @deprecated Use clearAuthCallbackUrl */
export const clearAuthFragment = clearAuthCallbackUrl;

/** Where Supabase should send the browser after Google OAuth (same tab). */
export function oauthLoginRedirectUrl(): string {
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  const params = new URLSearchParams();
  if (redirect?.startsWith('/')) params.set('redirect', redirect);
  const query = params.toString();
  return `${window.location.origin}/login${query ? `?${query}` : ''}`;
}

/** Navigate away for OAuth in the current tab (never window.open / _blank). */
export function redirectSameWindow(url: string): void {
  window.location.replace(url);
}
