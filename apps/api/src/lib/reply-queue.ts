import { redis } from './redis.js';
import { registerReplyFlow } from './reply-flows.js';

import type { QuotedMessageContext } from '@wavi/shared';

export interface ReplyJob {
  flow_id: string;
  group_id: string;
  group_name: string;
  wa_group_id: string;
  message_id: string | undefined;
  sender_wa_id: string;
  sender_name: string;
  body: string;
  wa_msg_id: string;
  quoted_message?: QuotedMessageContext | null;
  queued_at: number;
  /** Set when Claude succeeded but WhatsApp delivery failed — retry send only. */
  reply_text?: string;
  delivery_attempts?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  /** Base64 image payload when Claude requested an image and generation succeeded. */
  reply_image_base64?: string;
  reply_image_mimetype?: string;
  reply_image_caption?: string;
  /** Supabase Storage path after upload — reused on delivery retry. */
  reply_image_storage_path?: string;
}

export async function queueReplyJob(params: {
  group_id: string;
  group_name: string;
  wa_group_id: string;
  message_id: string | undefined;
  sender_wa_id: string;
  sender_name: string;
  body: string;
  wa_msg_id: string;
  quoted_message?: QuotedMessageContext | null;
  /** When set, the worker re-delivers this exact text instead of regenerating (used by failed-reply retries). */
  reply_text?: string;
}) {
  const flow_id = await registerReplyFlow({
    group_id: params.group_id,
    group_name: params.group_name,
    sender_name: params.sender_name,
    body: params.body,
  });

  const job: ReplyJob = {
    flow_id,
    ...params,
    queued_at: Date.now(),
  };

  await redis.lpush('reply_jobs', JSON.stringify(job));
}
