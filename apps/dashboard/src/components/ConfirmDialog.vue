<template>
  <Teleport to="body">
    <Transition name="confirm-backdrop">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="dialogTitleId"
        :aria-describedby="dialogBodyId"
        @keydown.esc="onCancel"
        @mousedown.self="onCancel"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

        <Transition name="confirm-modal">
          <div v-if="visible" class="relative w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container shadow-2xl">
            <div class="px-5 pb-5 pt-5">
              <div class="mb-1 flex items-start gap-3">
                <span class="material-symbols-outlined mt-0.5 shrink-0 text-[20px]" :class="options.variant === 'destructive' ? 'text-error' : 'text-secondary'" aria-hidden="true">
                  {{ options.variant === 'destructive' ? 'warning' : 'info' }}
                </span>
                <h2 :id="dialogTitleId" class="font-sora text-[15px] font-semibold leading-snug text-on-surface">
                  {{ options.title }}
                </h2>
              </div>
              <p :id="dialogBodyId" class="mt-2 ps-8 text-[13px] leading-relaxed text-on-surface-variant">
                {{ options.message }}
              </p>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-outline-variant/60 px-4 py-3">
              <button type="button" class="btn btn-secondary min-w-[80px]" @click="onCancel">
                {{ options.cancelLabel ?? t('confirm.cancel') }}
              </button>
              <button type="button" class="btn min-w-[80px]" :class="options.variant === 'destructive' ? 'btn-danger' : 'btn-primary'" @click="onConfirm">
                {{ options.confirmLabel ?? t('confirm.ok') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useConfirm } from '../composables/useConfirm';

const { t } = useI18n();
const { visible, options, _resolve } = useConfirm();

const dialogTitleId = 'confirm-dialog-title';
const dialogBodyId = 'confirm-dialog-body';

function onConfirm() {
  _resolve(true);
}

function onCancel() {
  _resolve(false);
}
</script>

<style scoped>
.confirm-backdrop-enter-active,
.confirm-backdrop-leave-active {
  transition: opacity 150ms ease;
}
.confirm-backdrop-enter-from,
.confirm-backdrop-leave-to {
  opacity: 0;
}

.confirm-modal-enter-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.confirm-modal-leave-active {
  transition:
    opacity 100ms ease,
    transform 100ms ease;
}
.confirm-modal-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
.confirm-modal-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
</style>
