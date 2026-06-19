import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'wavi-theme'

const mode = ref<ThemeMode>((localStorage.getItem(STORAGE_KEY) as ThemeMode) ?? 'system')
let mediaQuery: MediaQueryList | null = null

function resolveTheme(): 'light' | 'dark' {
  if (mode.value === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode.value
}

function applyTheme() {
  const resolved = resolveTheme()
  const html = document.documentElement
  html.classList.remove('light', 'dark')
  html.classList.add(resolved)
}

function setupSystemListener() {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', applyTheme)
    mediaQuery = null
  }
  if (mode.value === 'system') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', applyTheme)
  }
}

/** Call once before app mounts to avoid flash of wrong theme. */
export function bootstrapTheme() {
  applyTheme()
  setupSystemListener()
}

export function useTheme() {
  watch(mode, () => {
    localStorage.setItem(STORAGE_KEY, mode.value)
    applyTheme()
    setupSystemListener()
  })

  function setMode(m: ThemeMode) {
    mode.value = m
  }

  function cycleMode() {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    const idx = order.indexOf(mode.value)
    mode.value = order[(idx + 1) % order.length]
  }

  return { mode, setMode, cycleMode }
}
