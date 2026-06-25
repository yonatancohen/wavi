import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';

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

  // Cancel (delete) a pending reminder by id.
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { data } = await db.from('reminders').select('id').eq('id', req.params.id).maybeSingle();
    if (!data) return reply.code(404).send({ error: 'Reminder not found' });

    await db.from('reminders').delete().eq('id', req.params.id).throwOnError();
    return { ok: true };
  });
};
