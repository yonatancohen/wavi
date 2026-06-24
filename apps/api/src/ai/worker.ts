import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { generateReplyText } from './generate.js';
import { detectNegativeReaction, generateApology } from './recovery.js';
import { completeReplyFlow, markReplyFlowProcessing } from '../lib/reply-flows.js';
import { maybeAutoPauseOnBudget } from '../lib/cost.js';
import { isGroupReplyEnabled, type GroupStatus } from '@wavi/shared';
import type { ReplyJob } from '../lib/reply-queue.js';

const MAX_DELIVERY_ATTEMPTS = 5;
const REPLY_QUEUE_KEY = 'reply_jobs';
const IDLE_MS_MIN = 2_000;
const IDLE_MS_MAX = 30_000;

function getAgentId(): string | null {
  return process.env.AGENT_ID ?? null;
}

// ── Worker loop ───────────────────────────────────────────────

export async function startReplyWorker() {
  console.log('[ReplyWorker] Starting...');

  let idleMs = IDLE_MS_MIN;

  while (true) {
    try {
      // RPOP mutates the list and counts as a write on Upstash. When the queue
      // is empty, poll with LLEN (read) + backoff instead of hammering RPOP 24/7.
      const queueLen = await redis.llen(REPLY_QUEUE_KEY);
      if (queueLen === 0) {
        await sleep(idleMs);
        idleMs = Math.min(Math.round(idleMs * 1.5), IDLE_MS_MAX);
        continue;
      }

      idleMs = IDLE_MS_MIN;
      const raw = await redis.rpop(REPLY_QUEUE_KEY);

      if (!raw) continue;

      const job = typeof raw === 'string' ? (JSON.parse(raw) as ReplyJob) : (raw as ReplyJob);
      await processReplyJob(job);
    } catch (err) {
      console.error('[ReplyWorker] Error:', err);
      await sleep(2000);
    }
  }
}

// ── Process one reply job ─────────────────────────────────────

async function processReplyJob(job: ReplyJob) {
  const startTime = Date.now();
  const isDeliveryRetry = Boolean(job.reply_text);
  console.log(`[ReplyWorker] Processing job for group ${job.group_id}${isDeliveryRetry ? ' (delivery retry)' : ''}`);

  await markReplyFlowProcessing(job.flow_id);

  let deliveryFailed = false;

  try {
    const agentId = getAgentId();
    if (agentId) {
      const stats = await maybeAutoPauseOnBudget(agentId);
      if (stats) {
        console.warn('[ReplyWorker] Skipping reply — budget auto-pause active');
        return;
      }
    }

    const { data: group } = await db.from('groups').select('status').eq('id', job.group_id).maybeSingle();
    if (!group || !isGroupReplyEnabled(group.status as GroupStatus)) {
      console.warn(`[ReplyWorker] Skipping reply — group ${job.group_id} is not live (${group?.status ?? 'missing'})`);
      return;
    }

    let replyText = job.reply_text?.trim() ?? '';
    let inputTokens = job.prompt_tokens ?? 0;
    let outputTokens = job.completion_tokens ?? 0;

    if (!replyText) {
      const generated = await generateReplyText({
        groupId: job.group_id,
        senderWaId: job.sender_wa_id,
        senderName: job.sender_name,
        body: job.body,
        quotedMessage: job.quoted_message,
      });
      replyText = generated.replyText;
      inputTokens = generated.inputTokens;
      outputTokens = generated.outputTokens;
    }

    if (!replyText) {
      console.warn('[ReplyWorker] Empty reply generated');
      return;
    }

    const latencyMs = Date.now() - startTime;

    try {
      await deliverReply(job.wa_group_id, replyText, job.wa_msg_id);
    } catch (err) {
      const attempt = (job.delivery_attempts ?? 0) + 1;
      if (attempt < MAX_DELIVERY_ATTEMPTS) {
        deliveryFailed = true;
        await redis.lpush(
          REPLY_QUEUE_KEY,
          JSON.stringify({
            ...job,
            reply_text: replyText,
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            delivery_attempts: attempt,
          }),
        );
        console.warn(`[ReplyWorker] Delivery failed (attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS}), re-queued`, err);
        return;
      }
      throw err;
    }

    await db.from('messages').insert({
      group_id: job.group_id,
      sender_wa_id: 'agent',
      sender_name: process.env.WA_AGENT_NAME ?? 'wavi',
      body: replyText,
      is_agent_reply: true,
      timestamp: new Date().toISOString(),
    });

    const { data: replyRecord } = await db
      .from('replies')
      .insert({
        message_id: job.message_id,
        group_id: job.group_id,
        body: replyText,
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        latency_ms: latencyMs,
      })
      .select('id')
      .single();

    if (replyRecord?.id) {
      await redis.setex(`pending_reaction:${job.group_id}:${replyRecord.id}`, 120, JSON.stringify({ wa_group_id: job.wa_group_id, reply_body: replyText }));
    }

    if (agentId) await maybeAutoPauseOnBudget(agentId);

    console.log(`[ReplyWorker] Replied in ${latencyMs}ms (${inputTokens + outputTokens} tokens)`);
  } catch (err) {
    console.error('[ReplyWorker] Job failed:', err);
  } finally {
    if (!deliveryFailed) {
      await completeReplyFlow(job.flow_id);
    }
  }
}

// ── Reaction monitor (called by message handler) ──────────────

export async function checkForNegativeReaction(params: { groupId: string; senderWaId: string; body: string; waGroupId: string }) {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: `pending_reaction:${params.groupId}:*`,
      count: 100,
    });
    cursor = Number(nextCursor);
    keys.push(...batch);
  } while (cursor !== 0);
  if (keys.length === 0) return;

  const isNegative = detectNegativeReaction(params.body);
  if (!isNegative) return;

  const { data: group } = await db.from('groups').select('character_config').eq('id', params.groupId).single();

  const apology = await generateApology(group?.character_config);

  await deliverReply(params.waGroupId, apology);

  for (const key of keys) {
    const parts = key.split(':');
    const replyId = parts[parts.length - 1];
    await db.from('replies').update({ flagged_miss: true }).eq('id', replyId);
    await redis.del(key);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverReply(waDestination: string, body: string, quotedMsgId?: string) {
  if (waDestination.endsWith('@g.us')) {
    const { sendReply } = await import('../whatsapp/client.js');
    await sendReply(waDestination, body, quotedMsgId || undefined);
    return;
  }

  const { sendReply } = await import('../twilio/client.js');
  await sendReply(waDestination, body);
}
