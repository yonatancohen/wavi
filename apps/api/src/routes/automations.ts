import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { computeNextFireAt } from '../lib/automation-schedule.js';
import { fireAutomation } from '../lib/automation-fire.js';
import { isGroupReplyEnabled, type AutomationConfig, type AutomationType, type GroupAutomation, type GroupStatus } from '@wavi/shared';

export const automationsRoute: FastifyPluginAsync = async (fastify) => {
  // GET /api/automations?group_id=...
  fastify.get('/', async (req, reply) => {
    const query = req.query as Record<string, string>;
    if (!query.group_id) return reply.code(400).send({ error: 'group_id required' });

    const { data } = await db.from('group_automations').select('*').eq('group_id', query.group_id).order('created_at').throwOnError();

    return data ?? [];
  });

  // POST /api/automations — insert new (scheduled_post) or upsert singleton (silence_nudge, daily_digest)
  fastify.post<{ Body: { group_id: string; type: AutomationType; label?: string; enabled?: boolean; config?: AutomationConfig } }>('/', async (req, reply) => {
    const { group_id, type, label, enabled = false, config = {} as AutomationConfig } = req.body ?? {};
    if (!group_id || !type) return reply.code(400).send({ error: 'group_id and type required' });

    let next_fire_at: string | null = null;
    if (enabled) {
      next_fire_at = computeNextFireAt(type, config).toISOString();
    }

    if (type === 'scheduled_post') {
      const { data } = await db
        .from('group_automations')
        .insert({ group_id, type, label: label ?? null, enabled, config, next_fire_at })
        .select()
        .single()
        .throwOnError();
      return data;
    }

    // Singleton types: upsert by group_id+type
    const { data } = await db
      .from('group_automations')
      .upsert({ group_id, type, label: label ?? null, enabled, config, next_fire_at }, { onConflict: 'group_id,type' })
      .select()
      .single()
      .throwOnError();

    return data;
  });

  // PATCH /api/automations/:id
  fastify.patch<{ Params: { id: string }; Body: { enabled?: boolean; config?: AutomationConfig; label?: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const { enabled, config, label } = req.body ?? {};

    const { data: existing } = await db.from('group_automations').select('*').eq('id', id).maybeSingle().throwOnError();
    if (!existing) return reply.code(404).send({ error: 'Automation not found' });

    const mergedConfig: AutomationConfig = (config ?? existing.config) as AutomationConfig;
    const mergedEnabled: boolean = enabled ?? existing.enabled;

    let next_fire_at = existing.next_fire_at;
    if (mergedEnabled) {
      next_fire_at = computeNextFireAt(existing.type as AutomationType, mergedConfig).toISOString();
    }

    const updatePayload: Record<string, unknown> = { enabled: mergedEnabled, config: mergedConfig, next_fire_at };
    if (label !== undefined) updatePayload.label = label;

    const { data } = await db.from('group_automations').update(updatePayload).eq('id', id).select().single().throwOnError();

    return data;
  });

  // DELETE /api/automations/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, _reply) => {
    await db.from('group_automations').delete().eq('id', req.params.id).throwOnError();
    return { ok: true };
  });

  // POST /api/automations/:id/trigger — fire immediately, bypassing schedule
  fastify.post<{ Params: { id: string } }>('/:id/trigger', async (req, reply) => {
    const { id } = req.params;

    const { data: automation } = await db.from('group_automations').select('*, groups!group_automations_group_id_fkey(wa_group_id, status)').eq('id', id).maybeSingle().throwOnError();

    if (!automation) return reply.code(404).send({ error: 'Automation not found' });

    const group = automation.groups as { wa_group_id: string; status: string } | null;
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    if (!isGroupReplyEnabled(group.status as GroupStatus)) {
      return reply.code(409).send({ error: 'Group is not active — resume it before triggering' });
    }

    // Re-uses the shared fireAutomation helper which calls generateProactiveMessage,
    // sendReply, persists messages+replies, and updates last_fired_at+next_fire_at.
    // Budget check is handled inside generateProactiveMessage.
    const typedAutomation: Pick<GroupAutomation, 'id' | 'group_id' | 'type' | 'config'> = {
      id: automation.id as string,
      group_id: automation.group_id as string,
      type: automation.type as AutomationType,
      config: automation.config as AutomationConfig,
    };

    const result = await fireAutomation(typedAutomation, group.wa_group_id);
    return { ok: true, body: result.body };
  });
};
