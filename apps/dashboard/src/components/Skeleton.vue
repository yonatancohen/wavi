<template>
  <div class="skeleton" :class="[circle && '!rounded-full', props.class]" aria-hidden="true" />
</template>

<script setup lang="ts">
const props = defineProps<{
  circle?: boolean;
  class?: string;
}>();
</script>
