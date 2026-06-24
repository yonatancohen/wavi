<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header hidden lg:block">
      <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
        {{ t('howItWorks.title') }}
      </h1>
      <p class="mt-0.5 text-[12px] text-on-surface-variant">
        {{ t('howItWorks.subtitle') }}
      </p>
    </header>

    <div class="page-content py-7">
      <div class="mb-6 flex flex-wrap gap-2">
        <a
          v-for="phase in quickPhases"
          :key="phase.id"
          :href="`#${phase.id}`"
          class="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-[11px] font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
          @click.prevent="scrollTo(phase.id)"
        >
          <span class="material-symbols-outlined text-[14px]">{{ phase.icon }}</span>
          {{ phase.label }}
        </a>
      </div>

      <div class="flex flex-col gap-8 xl:flex-row xl:items-start">
        <aside v-if="toc.length > 0" class="order-2 shrink-0 xl:order-1 xl:sticky xl:top-6 xl:w-56 xl:self-start">
          <nav class="rounded-xl border border-outline-variant bg-surface-container p-4" :aria-label="t('howItWorks.tocLabel')">
            <p class="mb-3 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
              {{ t('howItWorks.onThisPage') }}
            </p>
            <ul class="space-y-1">
              <li v-for="entry in toc" :key="entry.id">
                <a
                  :href="`#${entry.id}`"
                  class="doc-toc-link"
                  :class="{
                    'doc-toc-link--active': activeId === entry.id,
                    'ps-3': entry.depth === 2,
                    'ps-5 text-[11px]': entry.depth === 3,
                  }"
                  @click.prevent="scrollTo(entry.id)"
                >
                  {{ entry.text }}
                </a>
              </li>
            </ul>
          </nav>
        </aside>

        <article ref="articleRef" class="doc-prose order-1 min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container p-6 sm:p-8 xl:order-2" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import mermaid from 'mermaid';
import docMarkdown from '@docs/HOW-WAVI-WORKS.md?raw';
import { extractToc, renderMarkdown } from '@/lib/markdown.js';

const { t } = useI18n();

const html = computed(() => renderMarkdown(docMarkdown));
const toc = computed(() => extractToc(docMarkdown));
const articleRef = ref<HTMLElement | null>(null);
const activeId = ref('');

const quickPhases = computed(() => [
  { id: 'the-big-picture-3-phases', icon: 'account_tree', label: t('howItWorks.phases.learn') },
  { id: 'easy-flow-what-happens-when-someone-tags-wavi', icon: 'bolt', label: t('howItWorks.phases.trigger') },
  { id: 'what-is-replay', icon: 'replay', label: t('howItWorks.phases.replay') },
  { id: 'highly-detailed-section', icon: 'menu_book', label: t('howItWorks.phases.deepDive') },
]);

function syncArticleHtml() {
  if (articleRef.value) {
    articleRef.value.innerHTML = html.value;
  }
}

function mermaidTheme(): 'dark' | 'default' {
  return document.documentElement.classList.contains('light') ? 'default' : 'dark';
}

async function renderMermaid() {
  if (!articleRef.value) return;
  const nodes = articleRef.value.querySelectorAll('.mermaid');
  if (nodes.length === 0) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: mermaidTheme(),
    securityLevel: 'strict',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  });

  await mermaid.run({ nodes });
}

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  activeId.value = id;
  history.replaceState(null, '', `#${id}`);
}

function updateActiveFromScroll() {
  const headings = toc.value.map((e) => document.getElementById(e.id)).filter((el): el is HTMLElement => el !== null);

  if (headings.length === 0) return;

  const offset = 120;
  let current = headings[0].id;

  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= offset) {
      current = heading.id;
    }
  }

  activeId.value = current;
}

let observer: MutationObserver | null = null;

onMounted(async () => {
  await nextTick();
  syncArticleHtml();
  await renderMermaid();

  if (location.hash) {
    const id = location.hash.slice(1);
    requestAnimationFrame(() => scrollTo(id));
  }

  window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
  updateActiveFromScroll();

  observer = new MutationObserver(() => {
    void renderMermaid();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

onUnmounted(() => {
  window.removeEventListener('scroll', updateActiveFromScroll);
  observer?.disconnect();
});

watch(html, async () => {
  await nextTick();
  syncArticleHtml();
  await renderMermaid();
});
</script>
