<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header hidden lg:flex h-14 items-center justify-between">
      <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
        {{ t('dashboard.title') }}
      </h1>
      <AgentStatusBadge />
    </header>

    <div class="page-content py-7">
      <!-- Hero: greeting + KPI row -->
      <section class="mb-8 animate-slide-up">
        <div class="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 class="font-sora text-headline-lg-mobile font-bold tracking-tight text-on-surface sm:text-[22px]">
              {{ t('dashboard.welcome', { name: 'Human' }) }}
            </h2>
            <p class="mt-1 text-[13px] text-on-surface-variant">
              {{ heroSubtitle }}
            </p>
          </div>
          <RouterLink
            to="/groups"
            class="flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary transition-all hover:brightness-110 active:scale-95"
          >
            <span class="material-symbols-outlined text-[18px]">group_add</span>
            {{ t('dashboard.manageGroups') }}
          </RouterLink>
        </div>

        <CostBanner class="mb-5" />

        <!-- KPI cells -->
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="stat-cell">
            <span class="stat-cell-label">{{ t('dashboard.kpi.agent') }}</span>
            <div class="mt-1">
              <AgentStatusBadge />
            </div>
          </div>
          <div class="stat-cell">
            <span class="stat-cell-label">{{ t('dashboard.kpi.activeGroups') }}</span>
            <span class="stat-cell-value text-primary">{{ activeGroups.length }}</span>
          </div>
          <div class="stat-cell">
            <span class="stat-cell-label">{{ t('dashboard.kpi.messagesToday') }}</span>
            <span class="stat-cell-value">{{ totalMessagesToday }}</span>
          </div>
          <div class="stat-cell">
            <span class="stat-cell-label">{{ t('dashboard.kpi.repliesToday') }}</span>
            <span class="stat-cell-value text-secondary">{{ totalRepliesToday }}</span>
          </div>
        </div>
      </section>

      <!-- Bento grid: Active Groups | Recent Activity | Session + Quick Actions -->
      <div class="bento-grid items-stretch">
        <!-- Active Groups -->
        <div class="flex h-full min-h-0 flex-col rounded-xl border border-outline-variant bg-surface-container p-5 md:col-span-4">
          <div class="mb-4 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined shrink-0 text-[18px] text-primary">group</span>
              <h3 class="font-sora text-[15px] font-semibold text-on-surface">
                {{ t('dashboard.activeGroups.title') }}
              </h3>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <span class="rounded-full bg-primary/[0.08] px-2.5 py-0.5 font-mono text-[11px] text-primary">
                {{ t('dashboard.activeGroups.live', { count: activeGroups.length }) }}
              </span>
              <RouterLink to="/groups" class="flex items-center gap-1 text-[12px] text-on-surface-variant no-underline transition-colors hover:text-primary">
                {{ t('dashboard.activeGroups.viewAll') }}
                <span class="material-symbols-outlined text-[14px] rtl:scale-x-[-1]">arrow_forward</span>
              </RouterLink>
            </div>
          </div>

          <LoadingSkeletons v-if="loading" variant="dashboard-groups" :count="3" />

          <div v-else-if="activeGroups.length === 0" class="rounded-xl border border-outline-variant bg-surface-container-high/60 p-8 text-center">
            <p class="mb-4 text-[13px] text-on-surface-variant">
              {{ t('dashboard.activeGroups.empty') }}
            </p>
            <RouterLink to="/groups" class="btn btn-primary">{{ t('dashboard.activeGroups.addFromWhatsapp') }}</RouterLink>
          </div>

          <div v-else class="dashboard-bento-scroll">
            <RouterLink v-for="group in activeGroups.slice(0, 6)" :key="group.id" :to="`/groups/${group.id}`" class="log-row no-underline transition-colors hover:bg-on-surface/[0.02]">
              <div
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                :class="group.status === 'active' ? 'bg-primary/15' : group.status === 'paused' ? 'bg-error/15' : 'bg-secondary/15'"
              >
                <span class="material-symbols-outlined text-[15px]" :class="group.status === 'active' ? 'text-primary' : group.status === 'paused' ? 'text-error' : 'text-secondary'"> forum </span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="mb-1 flex min-w-0 items-center gap-2">
                  <h5 class="truncate text-[13px] font-semibold text-on-surface">{{ group.name }}</h5>
                  <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" :class="statusBadgeClass(group.status)">
                    {{ statusLabel(group.status, t) }}
                  </span>
                </div>
                <GroupInlineStats :group="group" />
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container p-5 md:col-span-4">
          <ActiveFlowsIndicator v-if="activeFlowTotal > 0" class="mb-4" :total="activeFlowTotal" :flows="activeFlows" />

          <div class="mb-4 flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <span class="material-symbols-outlined shrink-0 text-[18px] text-primary">history</span>
              <h3 class="truncate font-sora text-[15px] font-semibold text-on-surface">
                {{ t('dashboard.recentActivity.title') }}
              </h3>
            </div>
            <RouterLink to="/activity" class="flex shrink-0 items-center gap-1 text-[12px] text-on-surface-variant no-underline transition-colors hover:text-primary">
              {{ t('dashboard.recentActivity.viewAll') }}
              <span class="material-symbols-outlined text-[14px] rtl:scale-x-[-1]">arrow_forward</span>
            </RouterLink>
          </div>

          <div class="dashboard-bento-scroll">
            <div v-for="item in activityItems" :key="item.title" class="log-row">
              <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" :class="item.iconBg">
                <span class="material-symbols-outlined text-[16px]" :class="item.iconColor">{{ item.icon }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-3">
                  <h5 class="truncate text-[13px] font-semibold" :class="item.iconColor">
                    {{ item.title }}
                  </h5>
                  <span class="log-timestamp shrink-0">{{ item.time }}</span>
                </div>
                <p class="mt-0.5 text-[13px] leading-relaxed text-on-surface-variant">
                  {{ item.body }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Session health + Quick Actions -->
        <div class="flex h-full flex-col gap-5 md:col-span-4">
          <AgentHealthPanel />

          <div class="flex flex-col rounded-xl border border-outline-variant bg-surface-container p-5">
            <div class="mb-4 flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-secondary">bolt</span>
              <h3 class="font-sora text-[15px] font-semibold text-on-surface">
                {{ t('dashboard.quickActions.title') }}
              </h3>
            </div>
            <div class="flex flex-1 flex-col space-y-2">
              <RouterLink
                to="/connect"
                class="group flex w-full items-center gap-3 rounded-lg border border-on-surface/[0.06] bg-surface-container-high/40 p-3.5 text-start no-underline transition-all hover:border-primary/30 hover:bg-surface-container-highest/60"
              >
                <span class="material-symbols-outlined text-[18px] text-primary transition-transform group-hover:scale-110">link</span>
                <div>
                  <p class="text-[13px] font-semibold text-on-surface">
                    {{ t('dashboard.quickActions.connectWhatsapp') }}
                  </p>
                  <p class="text-[11px] text-on-surface-variant">
                    {{ t('dashboard.quickActions.connectSubtitle') }}
                  </p>
                </div>
              </RouterLink>
              <RouterLink
                to="/groups"
                class="group flex w-full items-center gap-3 rounded-lg border border-on-surface/[0.06] bg-surface-container-high/40 p-3.5 text-start no-underline transition-all hover:border-secondary/30 hover:bg-surface-container-highest/60"
              >
                <span class="material-symbols-outlined text-[18px] text-secondary transition-transform group-hover:scale-110">group_add</span>
                <div>
                  <p class="text-[13px] font-semibold text-on-surface">
                    {{ t('dashboard.quickActions.registerGroups') }}
                  </p>
                  <p class="text-[11px] text-on-surface-variant">
                    {{ t('dashboard.quickActions.registerSubtitle') }}
                  </p>
                </div>
              </RouterLink>
              <RouterLink
                to="/activity"
                class="group flex w-full items-center gap-3 rounded-lg border border-on-surface/[0.06] bg-surface-container-high/40 p-3.5 text-start no-underline transition-all hover:border-tertiary/30 hover:bg-surface-container-highest/60"
              >
                <span class="material-symbols-outlined text-[18px] text-tertiary transition-transform group-hover:scale-110">history</span>
                <div>
                  <p class="text-[13px] font-semibold text-on-surface">
                    {{ t('dashboard.quickActions.viewActivity') }}
                  </p>
                  <p class="text-[11px] text-on-surface-variant">
                    {{ t('dashboard.quickActions.viewSubtitle') }}
                  </p>
                </div>
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGroupsStore } from '../stores/groups';
import { useFlowsStore } from '../stores/flows';
import { useAgentStore } from '../stores/agent';
import { statusBadgeClass, statusLabel } from '../lib/ui';
import LoadingSkeletons from '../components/LoadingSkeletons.vue';
import ActiveFlowsIndicator from '../components/ActiveFlowsIndicator.vue';
import AgentStatusBadge from '../components/AgentStatusBadge.vue';
import AgentHealthPanel from '../components/AgentHealthPanel.vue';
import CostBanner from '../components/CostBanner.vue';
import GroupInlineStats from '../components/GroupInlineStats.vue';

const { t } = useI18n();
const store = useGroupsStore();
const flowsStore = useFlowsStore();
const agentStore = useAgentStore();
const { groups, loading } = storeToRefs(store);
const { total: activeFlowTotal, flows: activeFlows } = storeToRefs(flowsStore);
const { connected: agentConnected, healthTier, connecting } = storeToRefs(agentStore);

const activeGroups = computed(() => groups.value.filter((g) => g.status === 'active'));

const totalMessagesToday = computed(() => activeGroups.value.reduce((sum, g) => sum + (g.message_count_today ?? 0), 0));

const totalRepliesToday = computed(() => activeGroups.value.reduce((sum, g) => sum + (g.reply_count_today ?? 0), 0));

const heroSubtitle = computed(() => {
  if (healthTier.value === 'degraded') return t('dashboard.subtitle.degraded');
  if (connecting.value) return t('dashboard.subtitle.connecting');
  if (!agentConnected.value) return t('dashboard.subtitle.disconnected');
  if (activeGroups.value.length === 0) return t('dashboard.subtitle.noGroups');
  return t('dashboard.subtitle.active', {
    count: activeGroups.value.length,
    groups: activeGroups.value.length === 1 ? t('dashboard.group') : t('dashboard.groups_word'),
  });
});

const activityItems = computed(() => {
  const items = [];

  if (healthTier.value === 'degraded') {
    items.push({
      title: 'WhatsApp',
      body: t('dashboard.recentActivity.waDegraded'),
      time: t('dashboard.recentActivity.now'),
      icon: 'sync_problem',
      iconBg: 'bg-secondary/15',
      iconColor: 'text-secondary',
    });
  } else if (connecting.value) {
    items.push({
      title: 'WhatsApp',
      body: t('dashboard.recentActivity.waConnecting'),
      time: t('dashboard.recentActivity.now'),
      icon: 'progress_activity',
      iconBg: 'bg-tertiary/15',
      iconColor: 'text-on-surface',
    });
  } else if (!agentConnected.value) {
    items.push({
      title: 'WhatsApp',
      body: t('dashboard.recentActivity.waOffline'),
      time: t('dashboard.recentActivity.now'),
      icon: 'link_off',
      iconBg: 'bg-error/15',
      iconColor: 'text-error',
    });
  } else {
    items.push({
      title: 'WhatsApp',
      body: t('dashboard.recentActivity.waOnline'),
      time: t('dashboard.recentActivity.now'),
      icon: 'check_circle',
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary',
    });
  }

  for (const group of activeGroups.value.slice(0, 2)) {
    items.push({
      title: group.name,
      body: `${group.message_count_today} messages and ${group.reply_count_today} replies today.`,
      time: t('dashboard.recentActivity.today'),
      icon: 'forum',
      iconBg: 'bg-secondary/15',
      iconColor: 'text-secondary',
    });
  }

  if (items.length < 3) {
    items.push({
      title: t('dashboard.recentActivity.intelligence'),
      body: t('dashboard.recentActivity.intelligenceBody'),
      time: t('dashboard.recentActivity.soon'),
      icon: 'smart_toy',
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary',
    });
  }

  return items.slice(0, 3);
});

onMounted(async () => {
  try {
    await store.fetchGroups();
  } catch {}
});
</script>
