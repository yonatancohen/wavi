import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isOwnerEmail } from '../lib/allowed-owner';

export const isAuthDisabled = import.meta.env.VITE_AUTH_DISABLED === 'true';

export type AuthErrorCode = 'accessDenied' | null;

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null);
  const ready = ref(false);
  const signingIn = ref(false);
  const error = ref<string | null>(null);
  const errorCode = ref<AuthErrorCode>(null);

  const isAuthenticated = computed(() => {
    if (isAuthDisabled) return true;
    if (!session.value) return false;
    return isOwnerEmail(session.value.user.email);
  });
  const accessToken = computed(() => session.value?.access_token ?? null);
  const userEmail = computed(() => session.value?.user?.email ?? null);

  function applySession(next: Session | null) {
    session.value = next;
  }

  async function rejectUnauthorized(_session: Session) {
    errorCode.value = 'accessDenied';
    error.value = null;
    signingIn.value = false;
    await supabase.auth.signOut();
    applySession(null);
  }

  async function acceptSession(next: Session | null) {
    if (next && !isOwnerEmail(next.user.email)) {
      await rejectUnauthorized(next);
      return;
    }

    applySession(next);
    if (next) {
      signingIn.value = false;
      error.value = null;
      errorCode.value = null;
    }
  }

  async function init() {
    if (isAuthDisabled) {
      ready.value = true;
      return;
    }

    const { data } = await supabase.auth.getSession();
    await acceptSession(data.session);

    supabase.auth.onAuthStateChange((_event, next) => {
      void acceptSession(next);
    });

    ready.value = true;
  }

  async function signInWithGoogle() {
    if (isAuthDisabled) return;

    signingIn.value = true;
    error.value = null;
    errorCode.value = null;

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });

    if (authError) {
      error.value = authError.message;
      signingIn.value = false;
    }
  }

  async function signOut() {
    if (isAuthDisabled) return;
    await supabase.auth.signOut();
    applySession(null);
    errorCode.value = null;
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
