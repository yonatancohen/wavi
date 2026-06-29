import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import router from './lib/router';
import { useAuthStore } from './stores/auth';
import './style.css';
import { bootstrapTheme } from './composables/useTheme';
import en from './locales/en.json';
import he from './locales/he.json';

// Bootstrap theme before mount to avoid flash of wrong theme
bootstrapTheme();

const savedLocale = localStorage.getItem('wavi-locale') ?? 'en';

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: { en, he },
});

// Apply initial locale/dir to document
document.documentElement.lang = savedLocale;
document.documentElement.dir = savedLocale === 'he' ? 'rtl' : 'ltr';

const pinia = createPinia();
const app = createApp(App);

app.use(i18n).use(pinia).use(router);

app.config.errorHandler = (err, instance, info) => {
  const msg = err instanceof Error ? err.message : String(err);
  const comp = (instance?.$.type as { __name?: string; name?: string })?.__name ?? (instance?.$.type as { name?: string })?.name ?? 'unknown';
  console.error('[Vue] Unhandled error:', err, '| component:', comp, '| info:', info);
  // Store for in-app display
  try {
    localStorage.setItem('wavi-vue-error', JSON.stringify({ msg, comp, info, stack: err instanceof Error ? err.stack : undefined, time: Date.now() }));
  } catch {
    // ignore storage errors
  }
};

async function bootstrap() {
  await useAuthStore(pinia).init();
  app.mount('#app');
}

void bootstrap();
