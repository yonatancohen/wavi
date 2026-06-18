import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'

// ── Groups route ─────────────────────────────────────────────
export const groupsRoute: FastifyPluginAsync = async (fastify) => {

  fastify.get('/', async () => {
    const { data } = await db
      .from('groups')
      .select(`
        *,
        message_count_today:messages(count),
        reply_count_today:replies(count)
      `)
      .throwOnError()
    return data
  })

  fastify.get<{ Params: { id: string } }>('/:id', async (req) => {
    const { data } = await db
      .from('groups')
      .select('*')
      .eq('id', req.params.id)
      .single()
      .throwOnError()
    return data
  })

  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/:id', async (req) => {
    const allowed = ['character_config', 'status', 'character_locked', 'language_mode']
    const update = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k)),
    )
    const { data } = await db
      .from('groups')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single()
      .throwOnError()
    return data
  })

  // Members
  fastify.get<{ Params: { id: string } }>('/:id/members', async (req) => {
    const { data } = await db
      .from('user_profiles')
      .select('*')
      .eq('group_id', req.params.id)
      .order('msg_count', { ascending: false })
      .throwOnError()
    return data
  })

  // Relationships
  fastify.get<{ Params: { id: string } }>('/:id/relationships', async (req) => {
    const { data } = await db
      .from('relationship_map')
      .select('*')
      .eq('group_id', req.params.id)
      .order('interaction_score', { ascending: false })
      .throwOnError()
    return data
  })

  // Memories
  fastify.get<{ Params: { id: string } }>('/:id/memories', async (req) => {
    const { data } = await db
      .from('group_memories')
      .select('*')
      .eq('group_id', req.params.id)
      .order('created_at', { ascending: false })
      .throwOnError()
    return data
  })

  fastify.delete<{ Params: { id: string; memoryId: string } }>('/:id/memories/:memoryId', async (req) => {
    await db
      .from('group_memories')
      .delete()
      .eq('id', req.params.memoryId)
      .eq('group_id', req.params.id)
      .throwOnError()
    return { ok: true }
  })
}

// ── Replies route ─────────────────────────────────────────────
export const repliesRoute: FastifyPluginAsync = async (fastify) => {

  fastify.get('/', async (req) => {
    const query = req.query as Record<string, string>
    let q = db
      .from('replies')
      .select(`
        *,
        messages!replies_message_id_fkey(sender_name, body),
        groups!replies_group_id_fkey(name)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (query.group_id) q = q.eq('group_id', query.group_id)
    if (query.flagged)  q = q.eq('flagged_miss', true)

    const { data } = await q.throwOnError()
    return data
  })

  fastify.patch<{ Params: { id: string }; Body: { flagged_miss: boolean } }>('/:id/flag', async (req) => {
    const { data } = await db
      .from('replies')
      .update({ flagged_miss: req.body.flagged_miss })
      .eq('id', req.params.id)
      .select()
      .single()
      .throwOnError()
    return data
  })
}

// ── Health route ─────────────────────────────────────────────
export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ ok: true, ts: new Date().toISOString() }))
}
