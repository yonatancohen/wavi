import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { resolveReplyImageUrls } from '../lib/image-storage.js';
import { queueReplyJob } from '../lib/reply-queue.js';
import { isGroupReplyEnabled, type GroupStatus } from '@wavi/shared';

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ ok: true, ts: new Date().toISOString() }));
};

export const repliesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req) => {
    const query = req.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
    const offset = Math.max(parseInt(query.offset ?? '0', 10), 0);

    let q = db
      .from('replies')
      .select(`*, messages!replies_message_id_fkey(sender_name, body), groups!replies_group_id_fkey(name)`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.group_id) q = q.eq('group_id', query.group_id);
    if (query.flagged) q = q.eq('flagged_miss', true);

    const { data } = await q.throwOnError();
    return resolveReplyImageUrls(data ?? []);
  });

  // Count of failed replies, optionally since a timestamp (e.g. start of today)
  // or scoped to a group — powers the dashboard "failures today" indicator.
  fastify.get('/failed/count', async (req) => {
    const query = req.query as Record<string, string>;
    let q = db.from('failed_replies').select('*', { count: 'exact', head: true });
    if (query.since) q = q.gte('created_at', query.since);
    if (query.group_id) q = q.eq('group_id', query.group_id);
    const { count } = await q.throwOnError();
    return { count: count ?? 0 };
  });

  // Replies that never reached the group (delivery exhausted or generation threw).
  fastify.get('/failed', async (req) => {
    const query = req.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
    const offset = Math.max(parseInt(query.offset ?? '0', 10), 0);

    let q = db
      .from('failed_replies')
      .select(`*, groups!failed_replies_group_id_fkey(name)`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.group_id) q = q.eq('group_id', query.group_id);
    if (query.stage) q = q.eq('stage', query.stage);

    const { data } = await q.throwOnError();
    return (data ?? []).map((row) => {
      const { groups, ...rest } = row as Record<string, unknown> & { groups?: { name?: string } | null };
      return { ...rest, group_name: groups?.name };
    });
  });

  // Re-send a failed reply. Delivery-stage failures re-deliver the exact text
  // that didn't make it; generation-stage failures are re-generated from the
  // original triggering message. The failed_replies row is removed on success —
  // if it fails again, the worker records a fresh failure.
  fastify.post<{ Params: { id: string } }>('/failed/:id/retry', async (req, reply) => {
    const { data: failed } = await db.from('failed_replies').select('*').eq('id', req.params.id).maybeSingle().throwOnError();
    if (!failed) return reply.code(404).send({ error: 'Failed reply not found' });

    const { data: group } = await db.from('groups').select('name, wa_group_id, status').eq('id', failed.group_id).maybeSingle().throwOnError();
    if (!group) return reply.code(404).send({ error: 'Group not found' });
    if (!isGroupReplyEnabled(group.status as GroupStatus)) {
      return reply.code(409).send({ error: 'Group is not active — resume it before retrying' });
    }

    // Recover sender context from the original message when available so a
    // regenerated reply is profile-aware; fall back to the stored trigger text.
    let senderWaId = '';
    let senderName = failed.trigger_name ?? '';
    let body = failed.trigger_body ?? '';
    if (failed.message_id) {
      const { data: msg } = await db.from('messages').select('sender_wa_id, sender_name, body').eq('id', failed.message_id).maybeSingle();
      if (msg) {
        senderWaId = msg.sender_wa_id;
        senderName = msg.sender_name ?? senderName;
        body = msg.body ?? body;
      }
    }

    await queueReplyJob({
      group_id: failed.group_id,
      group_name: group.name,
      wa_group_id: group.wa_group_id,
      message_id: failed.message_id ?? undefined,
      sender_wa_id: senderWaId,
      sender_name: senderName,
      body,
      wa_msg_id: '',
      quoted_message: null,
      reply_text: failed.stage === 'delivery' ? (failed.attempted_body ?? undefined) : undefined,
    });

    await db.from('failed_replies').delete().eq('id', req.params.id);
    return { ok: true };
  });

  fastify.patch<{ Params: { id: string }; Body: { flagged_miss: boolean } }>('/:id/flag', async (req) => {
    const { data } = await db.from('replies').update({ flagged_miss: req.body.flagged_miss }).eq('id', req.params.id).select().single().throwOnError();

    if (req.body.flagged_miss && data?.body && data?.group_id) {
      const { autoInsertMissMemory } = await import('../ai/worker.js');
      autoInsertMissMemory(data.group_id, data.body, 'dashboard').catch((err) => {
        console.error('[Replies] Failed to insert miss memory:', err);
      });
    }

    const [resolved] = await resolveReplyImageUrls([data]);
    return resolved;
  });
};
