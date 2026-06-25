import { db } from '../db/client.js';
import type { FailedReplyStage } from '@wavi/shared';

/**
 * Persist a reply that never reached the group so the dashboard can surface it.
 * Best-effort: a logging failure must never break the caller (worker loop or
 * message handler), so any error here is swallowed after being logged.
 */
export async function recordFailedReply(params: {
  group_id: string;
  message_id?: string | null;
  stage: FailedReplyStage;
  error: unknown;
  attempted_body?: string | null;
  trigger_name?: string | null;
  trigger_body?: string | null;
  attempts?: number;
}) {
  try {
    const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);
    await db.from('failed_replies').insert({
      message_id: params.message_id ?? null,
      group_id: params.group_id,
      stage: params.stage,
      error_message: errorMessage.slice(0, 1000),
      attempted_body: params.attempted_body ?? null,
      trigger_name: params.trigger_name ?? null,
      trigger_body: params.trigger_body ?? null,
      attempts: params.attempts ?? 1,
    });
  } catch (err) {
    console.error('[FailedReply] Failed to record:', err);
  }
}
