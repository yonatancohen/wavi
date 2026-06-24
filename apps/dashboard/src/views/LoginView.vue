<template>
  <div class="relative flex min-h-svh flex-col overflow-hidden">
    <LoginWaveBackground />

    <div class="relative z-10 flex flex-1 items-center justify-center px-5 py-10">
      <div class="w-full max-w-md animate-slide-up">
        <div class="rounded-2xl border border-outline-variant/80 bg-surface-container/90 p-8 shadow-wavi-ring backdrop-blur-md sm:p-10">
          <div class="mb-8 text-center">
            <div class="relative mx-auto mb-6 inline-block">
              <div class="absolute inset-0 animate-neon-pulse rounded-2xl bg-primary opacity-20 blur-xl" />
              <img src="/wavi-mascot.jpg" alt="" class="relative h-20 w-20 rounded-2xl object-contain ring-2 ring-primary/30" />
            </div>
            <h1 class="font-sora text-[24px] font-bold tracking-tight text-on-surface">
              {{ t('auth.title') }}
            </h1>
            <p class="mt-2 text-[14px] leading-relaxed text-on-surface-variant">
              {{ t('auth.subtitle') }}
            </p>
          </div>

          <div v-if="errorMessage" class="mb-5 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-center text-[13px] text-error">
            {{ errorMessage }}
          </div>

          <button type="button" class="btn-google w-full" :disabled="signingIn" @click.prevent="signInWithGoogle">
            <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>{{ signingIn ? t('auth.signingIn') : t('auth.signInGoogle') }}</span>
          </button>

          <p class="mt-6 text-center text-[12px] leading-relaxed text-on-surface-variant/70">
            {{ t('auth.privacyNote') }}
          </p>
        </div>
      </div>
    </div>

    <footer class="relative z-10 flex items-center justify-center gap-3 px-5 pb-6">
      <button type="button" class="icon-btn min-h-0 px-2 py-1 text-[10px] font-semibold" :title="locale === 'he' ? 'Switch to English' : 'עבור לעברית'" @click="toggleLocale">
        {{ locale === 'he' ? 'EN' : 'עב' }}
      </button>
      <button type="button" class="icon-btn min-h-0 p-1" :title="t('theme.' + mode)" @click="cycleMode">
        <span class="material-symbols-outlined text-[16px]">
          {{ mode === 'light' ? 'light_mode' : mode === 'dark' ? 'dark_mode' : 'brightness_auto' }}
        </span>
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme';
import { useLocale } from '../composables/useLocale';
import { useAuthStore } from '../stores/auth';
import LoginWaveBackground from '../components/LoginWaveBackground.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const { signingIn, error, errorCode } = storeToRefs(authStore);
const { signInWithGoogle } = authStore;
const { mode, cycleMode } = useTheme();
const { locale, toggleLocale } = useLocale();

const errorMessage = computed(() => {
  if (errorCode.value === 'accessDenied') return t('auth.accessDenied');
  return error.value;
});
</script>

<style scoped>
.btn-google {
  @apply inline-flex min-h-[2.75rem] w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-outline-variant bg-surface-container-high px-5 py-2.5 text-[13px] font-semibold text-on-surface transition-all hover:bg-surface-container-highest active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50;
}
</style>
