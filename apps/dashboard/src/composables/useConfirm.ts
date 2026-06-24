import { ref, shallowRef } from 'vue';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

const visible = ref(false);
const options = shallowRef<ConfirmOptions>({ title: '', message: '' });
let resolveFn: ((value: boolean) => void) | null = null;

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    options.value = opts;
    visible.value = true;
    return new Promise((resolve) => {
      resolveFn = resolve;
    });
  }

  function _resolve(value: boolean) {
    visible.value = false;
    resolveFn?.(value);
    resolveFn = null;
  }

  return { visible, options, confirm, _resolve };
}
