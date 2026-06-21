import type { FastifyPluginAsync } from 'fastify'
import type { ActiveReplyFlows } from '@wavi/shared'
import { getActiveReplyFlows } from '../lib/reply-flows.js'

export const flowsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/active', async () => {
    const { total, flows } = await getActiveReplyFlows(3)

    const response: ActiveReplyFlows = {
      total,
      flows: flows.map((flow) => ({
        id: flow.id,
        group_id: flow.group_id,
        group_name: flow.group_name,
        sender_name: flow.sender_name,
        message_preview: flow.message_preview,
        status: flow.status,
        queued_at: new Date(flow.queued_at).toISOString(),
      })),
    }

    return response
  })
}
