import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isOwnerEmail } from '../lib/allowed-owner';
import { clearAuthCallbackUrl, hasAuthCallbackPayload, oauthLoginRedirectUrl, redirectSameWindow } from '../lib/login-redirect';

export const isAuthRequired = import.meta.env.VITE_AUTH_REQUIRED === 'true';

export type AuthErrorCode = 'accessDenied' | null;

const OAUTH_CALLBACK_TIMEOUT_MS = 5_000;

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null);
  const ready = ref(false);
  const signingIn = ref(false);
  const error = ref<string | null>(null);
  const errorCode = ref<AuthErrorCode>(null);
  let initPromise: Promise<void> | null = null;
  let acceptQueue: Promise<void> = Promise.resolve();
  let explicitSignOut = false;

  const isAuthenticated = computed(() => {
    if (!isAuthRequired) return true;
    if (!session.value?.access_token) return false;
    return isOwnerEmail(session.value.user.email);
  });
  const accessToken = computed(() => session.value?.access_token ?? null);
  const userEmail = computed(() => session.value?.user?.email ?? null);

  function applySession(next: Session | null) {
    session.value = next;
  }

  function queueAcceptSession(next: Session | null) {
    acceptQueue = acceptQueue.then(() => acceptSession(next));
    return acceptQueue;
  }

  async function rejectUnauthorized(_session: Session) {
    errorCode.value = 'accessDenied';
    error.value = null;
    signingIn.value = false;
    explicitSignOut = true;
    try {
      await supabase.auth.signOut();
      applySession(null);
      clearAuthCallbackUrl();
    } finally {
      explicitSignOut = false;
    }
  }

  async function acceptSession(next: Session | null) {
    // Supabase emits SIGNED_OUT with a null session during OAuth token exchange.
    // Only clear the local session when the user (or our reject flow) signed out.
    if (!next) {
      if (explicitSignOut) applySession(null);
      return;
    }

    if (!isOwnerEmail(next.user.email)) {
      await rejectUnauthorized(next);
      return;
    }

    applySession(next);
    signingIn.value = false;
    error.value = null;
    errorCode.value = null;
    clearAuthCallbackUrl();

    if (import.meta.env.DEV) {
      console.info('[Wavi auth] session accepted', {
        userEmail: next.user.email ?? '(none)',
        allowedOwnerEmail: import.meta.env.VITE_ALLOWED_OWNER_EMAIL ?? '(unset)',
        hasAccessToken: !!next.access_token,
      });
    }
  }

  async function init() {
    if (!isAuthRequired) {
      ready.value = true;
      return;
    }

    if (ready.value) return;
    if (initPromise) {
      await initPromise;
      return;
    }

    initPromise = (async () => {
      const waitingForOAuthCallback = hasAuthCallbackPayload();
      let resolveInitial: (() => void) | null = null;

      const initialHydrated = new Promise<void>((resolve) => {
        resolveInitial = resolve;
      });

      supabase.auth.onAuthStateChange((event, next) => {
        void queueAcceptSession(next).finally(() => {
          if (!resolveInitial) return;
          const hydrated = event === 'INITIAL_SESSION' || (waitingForOAuthCallback && event === 'SIGNED_IN');
          if (hydrated) {
            resolveInitial();
            resolveInitial = null;
          }
        });
      });

      // Kick off storage / OAuth hash hydration — INITIAL_SESSION fires when done.
      await supabase.auth.getSession();

      await Promise.race([
        initialHydrated,
        new Promise<void>((resolve) => {
          setTimeout(resolve, OAUTH_CALLBACK_TIMEOUT_MS);
        }),
      ]);

      await acceptQueue;

      ready.value = true;
    })();

    await initPromise;
  }

  async function signInWithGoogle() {
    if (!isAuthRequired) return;

    signingIn.value = true;
    error.value = null;
    errorCode.value = null;

    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: oauthLoginRedirectUrl(),
        skipBrowserRedirect: true,
      },
    });

    if (authError) {
      error.value = authError.message;
      signingIn.value = false;
      return;
    }

    if (!data?.url) {
      error.value = 'Could not start Google sign-in';
      signingIn.value = false;
      return;
    }

    redirectSameWindow(data.url);
  }

  async function signOut() {
    if (!isAuthRequired) return;
    explicitSignOut = true;
    try {
      await supabase.auth.signOut();
      applySession(null);
      errorCode.value = null;
      clearAuthCallbackUrl();
    } finally {
      explicitSignOut = false;
    }
  }

  return {
    session,
    ready,
    signingIn,
    error,
    errorCode,
    isAuthenticated,
    accessToken,
    userEmail,
    init,
    signInWithGoogle,
    signOut,
  };
});
