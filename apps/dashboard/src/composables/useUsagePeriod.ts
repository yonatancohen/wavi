import { computed, ref, type Ref } from 'vue';
import type { UsagePeriodStats } from '@wavi/shared';

export type UsagePeriodId = 'today' | 'week' | 'month' | 'all_time';

export interface UsagePeriodSource {
  today: UsagePeriodStats;
  week: UsagePeriodStats;
  month: UsagePeriodStats;
  all_time: UsagePeriodStats;
}

export const EMPTY_USAGE_PERIOD: UsagePeriodStats = {
  requests: 0,
  input_tokens: 0,
  output_tokens: 0,
  spent_usd_estimate: 0,
  avg_latency_ms: null,
  breakdown: [],
};

export function pickUsagePeriod(source: UsagePeriodSource, id: UsagePeriodId): UsagePeriodStats {
  switch (id) {
    case 'today':
      return source.today;
    case 'week':
      return source.week;
    case 'month':
      return source.month;
    case 'all_time':
      return source.all_time;
  }
}

export function useUsagePeriod(stats: Ref<UsagePeriodSource | null>, defaultPeriod: UsagePeriodId = 'today') {
  const activePeriodId = ref<UsagePeriodId>(defaultPeriod);

  const activePeriod = computed(() => {
    if (!stats.value) return EMPTY_USAGE_PERIOD;
    return pickUsagePeriod(stats.value, activePeriodId.value);
  });

  function selectPeriod(id: UsagePeriodId) {
    activePeriodId.value = id;
  }

  return { activePeriodId, activePeriod, selectPeriod };
}
