import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ ok: true, ts: new Date().toISOString() }))
}

export const repliesRoute: FastifyPluginAsync = async (fastify) => {

  fastify.get('/', async (req) => {
    const query = req.query as Record<string, string>
    let q = db
      .from('replies')
      .select(`*, messages!replies_message_id_fkey(sender_name, body), groups!replies_group_id_fkey(name)`)
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
      .select().single().throwOnError()
    return data
  })
}
