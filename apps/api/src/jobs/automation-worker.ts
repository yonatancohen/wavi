import { db } from '../db/client.js';
import { isGroupReplyEnabled, type GroupAutomation, type GroupStatus, type SilenceNudgeConfig } from '@wavi/shared';
import { fireAutomation, shouldFireSilenceNudge, computeAutomationNextFireAt } from '../lib/automation-fire.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function startAutomationWorker() {
  console.log('[AutomationWorker] Starting...');

  while (true) {
    try {
      await fireDue();
    } catch (err) {
      console.error('[AutomationWorker] Poll error:', err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function fireDue() {
  const now = new Date().toISOString();

  const { data: due } = await db
    .from('group_automations')
    .select('*, groups!group_automations_group_id_fkey(wa_group_id, status)')
    .eq('enabled', true)
    .lte('next_fire_at', now)
    .not('next_fire_at', 'is', null);

  if (!due || due.length === 0) return;

  console.log(`[AutomationWorker] Processing ${due.length} due automation(s)`);

  for (const row of due) {
    try {
      await processAutomation(row as GroupAutomation & { groups: { wa_group_id: string; status: string } | null });
    } catch (err) {
      console.error(`[AutomationWorker] Failed to fire automation ${row.id} (${row.type}):`, err);
    }
  }
}

async function processAutomation(automation: GroupAutomation & { groups: { wa_group_id: string; status: string } | null }) {
  const { id, group_id, type, config } = automation;
  const group = automation.groups;

  if (!group?.wa_group_id) {
    console.warn(`[AutomationWorker] Automation ${id} has no wa_group_id — skipping`);
    return;
  }

  if (!isGroupReplyEnabled(group.status as GroupStatus)) {
    console.log(`[AutomationWorker] Automation ${id}: group ${group_id} is not active — skipping`);
    // Re-arm so we check again next cycle
    const nextFireAt = await computeAutomationNextFireAt(automation);
    await db.from('group_automations').update({ next_fire_at: nextFireAt.toISOString() }).eq('id', id);
    return;
  }

  // For silence_nudge: check if the group is actually quiet enough to fire
  if (type === 'silence_nudge') {
    const thresholdHours = (config as SilenceNudgeConfig).threshold_hours ?? 24;
    const { ok, elapsedHours } = await shouldFireSilenceNudge(group_id, thresholdHours);

    if (!ok) {
      console.log(`[AutomationWorker] Silence nudge ${id}: group is active (elapsed: ${elapsedHours}h) — re-arming`);
      const nextFireAt = await computeAutomationNextFireAt(automation);
      await db.from('group_automations').update({ next_fire_at: nextFireAt.toISOString() }).eq('id', id);
      return;
    }

    const result = await fireAutomation(automation, group.wa_group_id, { elapsedHours });
    console.log(`[AutomationWorker] Fired silence_nudge ${id} in ${result.latencyMs}ms`);
    return;
  }

  const result = await fireAutomation(automation, group.wa_group_id);
  console.log(`[AutomationWorker] Fired ${type} automation ${id} in ${result.latencyMs}ms`);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
