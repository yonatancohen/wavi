import { watch } from 'vue';
import { useI18n } from 'vue-i18n';

export function useLocale() {
  const { locale } = useI18n();

  function applyLocale(loc: string) {
    document.documentElement.lang = loc;
    document.documentElement.dir = loc === 'he' ? 'rtl' : 'ltr';
    localStorage.setItem('wavi-locale', loc);
  }

  watch(locale, applyLocale, { immediate: true });

  function setLocale(loc: string) {
    locale.value = loc;
  }

  function toggleLocale() {
    locale.value = locale.value === 'he' ? 'en' : 'he';
  }

  return { locale, setLocale, toggleLocale };
}
