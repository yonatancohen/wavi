import { db } from '../db/client.js';
import { generateProactiveMessage } from '../ai/proactive.js';
import { sendReply } from '../whatsapp/client.js';
import { computeNextFireAt, computeSilenceRearmAt } from './automation-schedule.js';
import type { AutomationConfig, AutomationType, GroupAutomation, SilenceNudgeConfig } from '@wavi/shared';

export type FireAutomationResult = {
  body: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

async function getLastHumanMessageAt(groupId: string): Promise<Date | null> {
  const { data } = await db.from('messages').select('timestamp').eq('group_id', groupId).eq('is_agent_reply', false).order('timestamp', { ascending: false }).limit(1).maybeSingle();

  return data?.timestamp ? new Date(data.timestamp as string) : null;
}

export async function shouldFireSilenceNudge(groupId: string, thresholdHours: number): Promise<{ ok: boolean; elapsedHours?: number }> {
  const lastHumanAt = await getLastHumanMessageAt(groupId);
  if (!lastHumanAt) return { ok: true, elapsedHours: thresholdHours };

  const elapsedMs = Date.now() - lastHumanAt.getTime();
  const elapsedHours = elapsedMs / 3_600_000;
  return { ok: elapsedHours >= thresholdHours, elapsedHours: Math.round(elapsedHours) };
}

export async function fireAutomation(automation: Pick<GroupAutomation, 'id' | 'group_id' | 'type' | 'config'>, waGroupId: string, opts?: { elapsedHours?: number }): Promise<FireAutomationResult> {
  const startTime = Date.now();
  const generated = await generateProactiveMessage(automation.group_id, automation.type, automation.config, opts?.elapsedHours);
  await sendReply(waGroupId, generated.body);

  const latencyMs = Date.now() - startTime;
  const now = new Date();

  await db.from('messages').insert({
    group_id: automation.group_id,
    sender_wa_id: 'agent',
    sender_name: process.env.WA_AGENT_NAME ?? 'wavi',
    body: generated.body,
    is_agent_reply: true,
    timestamp: now.toISOString(),
  });

  await db.from('replies').insert({
    group_id: automation.group_id,
    message_id: null,
    body: generated.body,
    prompt_tokens: generated.inputTokens,
    completion_tokens: generated.outputTokens,
    latency_ms: latencyMs,
  });

  const nextFireAt = await computeAutomationNextFireAt(automation, now);
  await db
    .from('group_automations')
    .update({
      last_fired_at: now.toISOString(),
      next_fire_at: nextFireAt.toISOString(),
    })
    .eq('id', automation.id)
    .throwOnError();

  return { ...generated, latencyMs };
}

export async function computeAutomationNextFireAt(automation: Pick<GroupAutomation, 'type' | 'group_id' | 'config'>, from = new Date()): Promise<Date> {
  if (automation.type === 'silence_nudge') {
    const threshold = (automation.config as SilenceNudgeConfig).threshold_hours ?? 24;
    const lastHumanAt = await getLastHumanMessageAt(automation.group_id);
    return computeSilenceRearmAt(lastHumanAt, threshold, from);
  }

  return computeNextFireAt(automation.type as AutomationType, automation.config as AutomationConfig, from);
}
