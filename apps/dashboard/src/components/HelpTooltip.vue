<template>
  <div ref="wrapperRef" class="relative inline-flex cursor-help" :aria-label="`${title}. ${body}`" @mouseenter="onEnter" @mouseleave="show = false">
    <slot />

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      :enter-from-class="showBelow ? 'opacity-0 -translate-y-1 scale-95' : 'opacity-0 translate-y-1 scale-95'"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      :leave-to-class="showBelow ? 'opacity-0 -translate-y-1 scale-95' : 'opacity-0 translate-y-1 scale-95'"
    >
      <div
        v-if="show"
        class="absolute z-50 w-56 rounded-xl border border-outline-variant bg-surface-container-highest shadow-[0_8px_32px_rgba(0,0,0,0.25)] pointer-events-none"
        :class="showBelow ? 'top-full mt-2' : 'bottom-full mb-2'"
        :style="tooltipStyle"
      >
        <div
          class="absolute h-2.5 w-2.5 rounded-sm border-outline-variant bg-surface-container-highest"
          :class="showBelow ? '-top-[5px] rounded-tl-sm border-t border-l' : '-bottom-[5px] rounded-br-sm border-b border-r'"
          :style="arrowStyle"
        />

        <div class="p-3">
          <p class="mb-1.5 font-sora text-[12px] font-semibold text-on-surface">{{ title }}</p>
          <p class="text-[11px] leading-relaxed text-on-surface-variant">{{ body }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

defineProps<{
  title: string;
  body: string;
}>();

const show = ref(false);
const showBelow = ref(false);
const wrapperRef = ref<HTMLElement | null>(null);

const TOOLTIP_WIDTH = 224;
const VIEWPORT_MARGIN = 8;
const ESTIMATED_TOOLTIP_HEIGHT = 120;

const tooltipLeft = ref(0);
const arrowLeft = ref(0);

function onEnter() {
  if (wrapperRef.value) {
    const rect = wrapperRef.value.getBoundingClientRect();
    showBelow.value = rect.top < ESTIMATED_TOOLTIP_HEIGHT + VIEWPORT_MARGIN;

    const triggerCenterX = rect.left + rect.width / 2;
    const idealLeft = triggerCenterX - TOOLTIP_WIDTH / 2;
    const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(idealLeft, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN));
    tooltipLeft.value = clampedLeft - rect.left;
    arrowLeft.value = triggerCenterX - clampedLeft;
  }
  show.value = true;
}

const tooltipStyle = computed(() => ({
  left: `${tooltipLeft.value}px`,
}));

const arrowStyle = computed(() => ({
  left: `${arrowLeft.value}px`,
  transform: `translateX(-50%) rotate(${showBelow.value ? 225 : 45}deg)`,
}));
</script>
