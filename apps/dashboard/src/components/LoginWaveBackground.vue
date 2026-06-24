<template>
  <div class="login-waves pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div class="login-waves-base absolute inset-0" />

    <motion.div
      v-for="(orb, index) in orbs"
      :key="orb.id"
      class="login-waves-orb absolute rounded-full"
      :class="orb.className"
      :animate="reducedMotion ? undefined : orb.animate"
      :transition="reducedMotion ? undefined : orb.transition"
      :style="{ animationDelay: reducedMotion ? undefined : `${index * 2}s` }"
    />

    <svg class="login-waves-svg absolute inset-x-0 bottom-0 h-[min(52vh,28rem)] w-full" viewBox="0 0 2880 640" preserveAspectRatio="none">
      <defs>
        <linearGradient id="login-wave-grad-a" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgb(var(--color-primary))" stop-opacity="0.14" />
          <stop offset="50%" stop-color="rgb(var(--color-secondary))" stop-opacity="0.1" />
          <stop offset="100%" stop-color="rgb(var(--color-primary))" stop-opacity="0.16" />
        </linearGradient>
        <linearGradient id="login-wave-grad-b" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgb(var(--color-primary))" stop-opacity="0.22" />
          <stop offset="100%" stop-color="rgb(var(--color-primary-container))" stop-opacity="0.12" />
        </linearGradient>
        <linearGradient id="login-wave-grad-c" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgb(var(--color-primary))" stop-opacity="0.28" />
          <stop offset="100%" stop-color="rgb(var(--color-primary))" stop-opacity="0.08" />
        </linearGradient>
      </defs>

      <motion.g v-for="layer in waveLayers" :key="layer.id" :animate="reducedMotion ? undefined : layer.animate" :transition="reducedMotion ? undefined : layer.transition">
        <path :d="layer.path" :fill="layer.fill" />
        <path :d="layer.path" :fill="layer.fill" transform="translate(1440 0)" />
      </motion.g>
    </svg>

    <div class="login-waves-fade absolute inset-0" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { motion } from 'motion-v';

const reducedMotion = ref(false);
let motionQuery: MediaQueryList | null = null;

function syncReducedMotion() {
  reducedMotion.value = motionQuery?.matches ?? false;
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  syncReducedMotion();
  motionQuery.addEventListener('change', syncReducedMotion);
});

onUnmounted(() => {
  motionQuery?.removeEventListener('change', syncReducedMotion);
});

const wavePathBack = 'M0,360 C240,420 480,300 720,360 C960,420 1200,300 1440,360 L1440,640 L0,640 Z';
const wavePathMid = 'M0,430 C320,500 640,370 960,430 C1180,470 1320,390 1440,430 L1440,640 L0,640 Z';
const wavePathFront = 'M0,500 C280,560 560,440 840,500 C1080,548 1260,470 1440,500 L1440,640 L0,640 Z';

const waveLayers = [
  {
    id: 'back',
    path: wavePathBack,
    fill: 'url(#login-wave-grad-a)',
    animate: { x: [0, -1440] },
    transition: { duration: 34, repeat: Infinity, ease: 'linear' },
  },
  {
    id: 'mid',
    path: wavePathMid,
    fill: 'url(#login-wave-grad-b)',
    animate: { x: [0, -1440] },
    transition: { duration: 24, repeat: Infinity, ease: 'linear' },
  },
  {
    id: 'front',
    path: wavePathFront,
    fill: 'url(#login-wave-grad-c)',
    animate: { x: [0, -1440] },
    transition: { duration: 16, repeat: Infinity, ease: 'linear' },
  },
];

const orbs = [
  {
    id: 'orb-a',
    className: 'login-waves-orb-a -start-24 top-[12%] h-72 w-72',
    animate: { x: [0, 48, 0], y: [0, -36, 0], scale: [1, 1.08, 1] },
    transition: { duration: 20, repeat: Infinity, ease: 'easeInOut' },
  },
  {
    id: 'orb-b',
    className: 'login-waves-orb-b -end-20 top-[28%] h-80 w-80',
    animate: { x: [0, -40, 0], y: [0, 28, 0], scale: [1, 1.12, 1] },
    transition: { duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 1.5 },
  },
  {
    id: 'orb-c',
    className: 'login-waves-orb-c start-1/4 bottom-[38%] h-56 w-56',
    animate: { x: [0, 32, 0], y: [0, 20, 0], opacity: [0.45, 0.75, 0.45] },
    transition: { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 0.75 },
  },
];
</script>

<style scoped>
.login-waves-base {
  background:
    radial-gradient(ellipse 80% 55% at 50% -10%, color-mix(in srgb, rgb(var(--color-primary)) 16%, transparent), transparent 70%),
    radial-gradient(ellipse 60% 40% at 85% 20%, color-mix(in srgb, rgb(var(--color-secondary)) 8%, transparent), transparent 65%), rgb(var(--color-background));
}

.login-waves-orb {
  filter: blur(72px);
  will-change: transform, opacity;
}

.login-waves-orb-a {
  background: color-mix(in srgb, rgb(var(--color-primary)) 22%, transparent);
}

.login-waves-orb-b {
  background: color-mix(in srgb, rgb(var(--color-secondary)) 14%, transparent);
}

.login-waves-orb-c {
  background: color-mix(in srgb, rgb(var(--color-primary-container)) 18%, transparent);
}

.login-waves-svg {
  opacity: 0.95;
  mask-image: linear-gradient(to top, black 55%, transparent 100%);
}

.login-waves-fade {
  background: linear-gradient(to bottom, rgb(var(--color-background)) 0%, color-mix(in srgb, rgb(var(--color-background)) 88%, transparent) 38%, transparent 72%);
}

@media (prefers-reduced-motion: reduce) {
  .login-waves-orb,
  .login-waves-svg {
    animation: none !important;
  }
}
</style>
