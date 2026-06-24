import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const isAuthDisabled = import.meta.env.VITE_AUTH_DISABLED === 'true';

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null);
  const ready = ref(false);
  const signingIn = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => isAuthDisabled || !!session.value);
  const accessToken = computed(() => session.value?.access_token ?? null);
  const userEmail = computed(() => session.value?.user?.email ?? null);

  function applySession(next: Session | null) {
    session.value = next;
  }

  async function init() {
    if (isAuthDisabled) {
      ready.value = true;
      return;
    }

    const { data } = await supabase.auth.getSession();
    applySession(data.session);

    supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next);
      if (next) {
        signingIn.value = false;
        error.value = null;
      }
    });

    ready.value = true;
  }

  async function signInWithGoogle() {
    if (isAuthDisabled) return;

    signingIn.value = true;
    error.value = null;

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
  }

  return {
    session,
    ready,
    signingIn,
    error,
    isAuthenticated,
    accessToken,
    userEmail,
    init,
    signInWithGoogle,
    signOut,
  };
});
