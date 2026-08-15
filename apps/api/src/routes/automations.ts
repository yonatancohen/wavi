import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { computeNextFireAt } from '../lib/automation-schedule.js';
import { deliverAutomationBody, fireAutomation, previewAutomation } from '../lib/automation-fire.js';
import { isGroupReplyEnabled, type AutomationConfig, type AutomationType, type GroupStatus } from '@wavi/shared';

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

    // Singleton types (silence_nudge, daily_digest): find existing row then update or insert.
    // We avoid onConflict because the partial unique index (idx_automations_singleton) may not
    // be recognised by PostgREST's upsert by column names after the constraint rename.
    const { data: existing } = await db.from('group_automations').select('id').eq('group_id', group_id).eq('type', type).maybeSingle().throwOnError();

    if (existing?.id) {
      const { data } = await db
        .from('group_automations')
        .update({ label: label ?? null, enabled, config, next_fire_at })
        .eq('id', existing.id)
        .select()
        .single()
        .throwOnError();
      return data;
    }

    const { data } = await db
      .from('group_automations')
      .insert({ group_id, type, label: label ?? null, enabled, config, next_fire_at })
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

  async function loadLiveAutomation(id: string) {
    const { data: automation } = await db.from('group_automations').select('*, groups!group_automations_group_id_fkey(wa_group_id, status)').eq('id', id).maybeSingle().throwOnError();
    if (!automation) return { ok: false as const, code: 404 as const, message: 'Automation not found' };

    const group = automation.groups as { wa_group_id: string; status: string } | null;
    if (!group) return { ok: false as const, code: 404 as const, message: 'Group not found' };
    if (!isGroupReplyEnabled(group.status as GroupStatus)) {
      return { ok: false as const, code: 409 as const, message: 'Group is not active — resume it before triggering' };
    }

    return {
      ok: true as const,
      automation: {
        id: automation.id as string,
        group_id: automation.group_id as string,
        type: automation.type as AutomationType,
        config: automation.config as AutomationConfig,
      },
      group,
    };
  }

  // POST /api/automations/:id/preview — generate without sending
  fastify.post<{ Params: { id: string } }>('/:id/preview', async (req, reply) => {
    const loaded = await loadLiveAutomation(req.params.id);
    if (!loaded.ok) return reply.code(loaded.code).send({ error: loaded.message });

    const generated = await previewAutomation(loaded.automation);
    return { ok: true, body: generated.body, input_tokens: generated.inputTokens, output_tokens: generated.outputTokens };
  });

  // POST /api/automations/:id/send — send a reviewed body
  fastify.post<{ Params: { id: string }; Body: { message?: string; input_tokens?: number; output_tokens?: number } }>('/:id/send', async (req, reply) => {
    const message = req.body?.message?.trim();
    if (!message) return reply.code(400).send({ error: 'message is required' });

    const loaded = await loadLiveAutomation(req.params.id);
    if (!loaded.ok) return reply.code(loaded.code).send({ error: loaded.message });

    const result = await deliverAutomationBody(loaded.automation, loaded.group.wa_group_id, message, {
      inputTokens: req.body?.input_tokens,
      outputTokens: req.body?.output_tokens,
    });
    return { ok: true, body: result.body };
  });

  // POST /api/automations/:id/trigger — fire immediately, bypassing schedule
  fastify.post<{ Params: { id: string } }>('/:id/trigger', async (req, reply) => {
    const loaded = await loadLiveAutomation(req.params.id);
    if (!loaded.ok) return reply.code(loaded.code).send({ error: loaded.message });

    const result = await fireAutomation(loaded.automation, loaded.group.wa_group_id);
    return { ok: true, body: result.body };
  });
};
