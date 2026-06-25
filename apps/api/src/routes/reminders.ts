import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { updateReminder } from '../lib/reminder-store.js';

export const remindersRoute: FastifyPluginAsync = async (fastify) => {
  // List all pending (future, unsent) reminders. Optionally filter by group_id.
  fastify.get('/', async (req) => {
    const query = req.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit ?? '200', 10), 500);

    let q = db.from('reminders').select('*, groups!reminders_group_id_fkey(name)').is('sent_at', null).gte('fire_at', new Date().toISOString()).order('fire_at', { ascending: true }).limit(limit);

    if (query.group_id) q = q.eq('group_id', query.group_id);

    const { data } = await q.throwOnError();

    return (data ?? []).map((row) => {
      const { groups, ...rest } = row as Record<string, unknown> & {
        groups?: { name?: string } | null;
      };
      return { ...rest, group_name: groups?.name ?? null };
    });
  });

  // Update mutable fields of a pending reminder (text and/or fire_at).
  fastify.patch<{
    Params: { id: string };
    Body: { reminder_text?: string; fire_at?: string };
  }>('/:id', async (req, reply) => {
    const { reminder_text, fire_at } = req.body ?? {};
    if (!reminder_text && !fire_at) {
      return reply.code(400).send({ error: 'Provide at least reminder_text or fire_at' });
    }

    if (fire_at && new Date(fire_at) <= new Date()) {
      return reply.code(400).send({ error: 'fire_at must be in the future' });
    }

    const patch: { reminder_text?: string; fire_at?: string } = {};
    if (reminder_text) patch.reminder_text = reminder_text.trim();
    if (fire_at) patch.fire_at = fire_at;

    const updated = await updateReminder(req.params.id, patch);
    if (!updated) return reply.code(404).send({ error: 'Reminder not found or already sent' });

    return updated;
  });

  // Cancel (delete) a pending reminder by id.
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { data } = await db.from('reminders').select('id').eq('id', req.params.id).maybeSingle();
    if (!data) return reply.code(404).send({ error: 'Reminder not found' });

    await db.from('reminders').delete().eq('id', req.params.id).throwOnError();
    return { ok: true };
  });
};
