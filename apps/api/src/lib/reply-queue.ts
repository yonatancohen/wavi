import { redis } from './redis.js'
import { registerReplyFlow } from './reply-flows.js'

export interface ReplyJob {
  flow_id: string
  group_id: string
  group_name: string
  wa_group_id: string
  message_id: string | undefined
  sender_wa_id: string
  sender_name: string
  body: string
  wa_msg_id: string
  queued_at: number
}

export async function queueReplyJob(params: {
  group_id: string
  group_name: string
  wa_group_id: string
  message_id: string | undefined
  sender_wa_id: string
  sender_name: string
  body: string
  wa_msg_id: string
}) {
  const flow_id = await registerReplyFlow({
    group_id: params.group_id,
    group_name: params.group_name,
    sender_name: params.sender_name,
    body: params.body,
  })

  const job: ReplyJob = {
    flow_id,
    ...params,
    queued_at: Date.now(),
  }

  await redis.lpush('reply_jobs', JSON.stringify(job))
}
