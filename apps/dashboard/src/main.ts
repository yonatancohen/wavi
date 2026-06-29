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
  console.error('[Vue] Unhandled error:', err);
  console.error('[Vue] Component:', instance?.$options?.name ?? instance?.$.type?.name ?? 'unknown');
  console.error('[Vue] Info:', info);
};

async function bootstrap() {
  await useAuthStore(pinia).init();
  app.mount('#app');
}

void bootstrap();
