<template>
  <div class="border-t border-outline-variant px-4 py-3">
    <div v-if="showSignOut && userEmail" class="mb-2 truncate px-1 text-[10px] text-on-surface-variant/60" :title="userEmail">
      {{ userEmail }}
    </div>
    <div class="flex items-center justify-between gap-2">
      <p class="select-none font-mono text-[10px] text-on-surface-variant/40">wavi · v0.1</p>
      <div class="flex items-center gap-1">
        <button
          v-if="showSignOut"
          type="button"
          class="icon-btn min-h-0 px-2 py-1 text-[10px] font-semibold text-on-surface-variant hover:text-error"
          :title="t('auth.signOut')"
          @click="handleSignOut"
        >
          <span class="material-symbols-outlined text-[16px]">logout</span>
        </button>

        <button type="button" class="icon-btn min-h-0 px-2 py-1 text-[10px] font-semibold" :title="locale === 'he' ? 'Switch to English' : 'עבור לעברית'" @click="toggleLocale">
          {{ locale === 'he' ? 'EN' : 'עב' }}
        </button>

        <button type="button" class="icon-btn min-h-0 p-1" :title="t('theme.' + mode)" @click="cycleMode">
          <span class="material-symbols-outlined text-[16px]">
            {{ mode === 'light' ? 'light_mode' : mode === 'dark' ? 'dark_mode' : 'brightness_auto' }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useTheme } from '../composables/useTheme';
import { useLocale } from '../composables/useLocale';
import { useAuthStore, isAuthRequired } from '../stores/auth';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const { userEmail } = storeToRefs(authStore);
const { mode, cycleMode } = useTheme();
const { locale, toggleLocale } = useLocale();

const showSignOut = computed(() => isAuthRequired);

async function handleSignOut() {
  await authStore.signOut();
  await router.push('/login');
}
</script>
