<template>
  <div role="status" aria-label="Loading content" :class="rootClass">
    <!-- Groups page grid -->
    <template v-if="variant === 'group-cards'">
      <div v-for="i in count" :key="i" class="skeleton-card glass-card rounded-xl p-5" :style="{ animationDelay: `${i * 70}ms` }">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-2.5">
            <Skeleton class="h-5 w-5 shrink-0 rounded-md" />
            <Skeleton class="h-4 w-[52%] max-w-[180px] rounded-md" />
          </div>
          <Skeleton class="h-5 w-[52px] shrink-0 rounded-full" />
        </div>
        <Skeleton class="mb-4 h-2.5 w-[62%] rounded-sm" />
        <div class="flex gap-4">
          <Skeleton class="h-3 w-5 rounded-sm" />
          <Skeleton class="h-3 w-5 rounded-sm" />
          <Skeleton class="h-3 w-5 rounded-sm" />
          <Skeleton class="h-3 w-5 rounded-sm" />
        </div>
      </div>
    </template>

    <!-- Dashboard bento group tiles -->
    <template v-else-if="variant === 'dashboard-groups'">
      <div v-for="i in count" :key="i" class="skeleton-card glass-card rounded-xl p-4" :style="{ animationDelay: `${i * 70}ms` }">
        <div class="mb-4 flex items-center justify-between">
          <Skeleton class="h-4 w-14 rounded-full" />
          <Skeleton class="h-2.5 w-16 rounded-sm" />
        </div>
        <Skeleton class="mb-2 h-[18px] w-[72%] rounded-md" />
        <Skeleton class="h-3.5 w-[48%] rounded-sm" />
      </div>
    </template>

    <!-- Activity feed -->
    <template v-else-if="variant === 'activity-list'">
      <div class="rounded-xl border border-outline-variant bg-surface-container">
        <div class="border-b border-outline-variant px-5 py-3">
          <Skeleton class="h-3 w-16 rounded-sm" />
        </div>
        <div class="divide-y divide-on-surface/[0.04]">
          <div v-for="i in count" :key="i" class="skeleton-card flex items-start gap-4 px-5 py-4" :style="{ animationDelay: `${i * 60}ms` }">
            <Skeleton class="mt-0.5 h-8 w-8 shrink-0 rounded-lg" />
            <div class="min-w-0 flex-1 pt-0.5">
              <div class="mb-2 flex items-center justify-between gap-3">
                <Skeleton class="h-3.5 w-[96px] rounded-sm" />
                <Skeleton class="h-2.5 w-10 rounded-sm" />
              </div>
              <Skeleton class="mb-2 h-3 w-[48%] rounded-sm" />
              <Skeleton class="mb-1.5 h-3.5 w-full rounded-sm" />
              <Skeleton class="mb-3 h-3.5 w-[88%] rounded-sm" />
              <div class="flex gap-4">
                <Skeleton class="h-2.5 w-12 rounded-sm" />
                <Skeleton class="h-2.5 w-16 rounded-sm" />
                <Skeleton class="h-5 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Group detail (bento layout approximation) -->
    <template v-else-if="variant === 'group-detail'">
      <div class="skeleton-card rounded-xl border border-outline-variant bg-surface-container p-4" style="animation-delay: 0ms">
        <Skeleton class="mb-2 h-3 w-full rounded-sm" />
        <Skeleton class="h-3 w-[72%] rounded-sm" />
      </div>
      <div class="grid gap-4 lg:grid-cols-[4fr_8fr] lg:items-stretch">
        <div class="skeleton-card flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container p-4" style="animation-delay: 60ms">
          <div class="mb-4 flex items-center gap-2">
            <Skeleton class="h-4 w-4 rounded-md" />
            <Skeleton class="h-3.5 w-20 rounded-sm" />
          </div>
          <Skeleton class="mb-3 h-2.5 w-full rounded-sm" />
          <Skeleton class="mb-3 h-2.5 w-[85%] rounded-sm" />
          <Skeleton class="h-9 w-full max-w-xs rounded-full" />
          <div class="mt-auto border-t border-outline-variant pt-5">
            <div class="mb-3 flex items-center gap-2">
              <Skeleton class="h-4 w-4 rounded-md" />
              <Skeleton class="h-3.5 w-24 rounded-sm" />
            </div>
            <Skeleton class="mb-3 h-2.5 w-full rounded-sm" />
            <Skeleton class="h-9 w-28 rounded-full" />
          </div>
        </div>
        <div class="skeleton-card flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container p-6" style="animation-delay: 120ms">
          <div class="mb-5 flex items-center gap-2">
            <Skeleton class="h-6 w-6 rounded-md" />
            <Skeleton class="h-5 w-16 rounded-md" />
          </div>
          <Skeleton class="mb-2 h-3.5 w-full rounded-sm" />
          <Skeleton class="mb-2 h-3.5 w-[94%] rounded-sm" />
          <Skeleton class="mb-6 h-3.5 w-[68%] rounded-sm" />
          <Skeleton class="min-h-[140px] flex-1 rounded-xl" />
          <Skeleton class="mt-4 h-10 w-[108px] rounded-full" />
        </div>
      </div>
    </template>

    <!-- WhatsApp discover modal -->
    <template v-else-if="variant === 'discover-list'">
      <div
        v-for="i in count"
        :key="i"
        class="skeleton-card flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-variant/40 p-4"
        :style="{ animationDelay: `${i * 80}ms` }"
      >
        <div class="min-w-0 flex-1 space-y-2">
          <Skeleton class="h-4 w-[148px] max-w-[70%] rounded-sm" />
          <Skeleton class="h-3 w-24 rounded-sm" />
        </div>
        <Skeleton class="h-9 w-[84px] shrink-0 rounded-full" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Skeleton from './Skeleton.vue';

const props = withDefaults(
  defineProps<{
    variant: 'group-cards' | 'dashboard-groups' | 'activity-list' | 'group-detail' | 'discover-list';
    count?: number;
  }>(),
  {
    count: 4,
  },
);

const rootClass = computed(() => {
  switch (props.variant) {
    case 'group-cards':
      return 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3';
    case 'dashboard-groups':
      return 'grid grid-cols-1 gap-4';
    case 'activity-list':
      return '';
    case 'group-detail':
      return 'space-y-4';
    case 'discover-list':
      return 'flex flex-col gap-3 px-6 pb-6 pt-4';
    default:
      return '';
  }
});
</script>
