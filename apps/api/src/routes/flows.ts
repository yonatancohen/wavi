import type { FastifyPluginAsync } from 'fastify';
import type { ActiveReplyFlows } from '@wavi/shared';
import { getActiveReplyFlows } from '../lib/reply-flows.js';
import { getPeakInflightToday } from '../lib/usage.js';
import { redis } from '../lib/redis.js';

const REPLY_QUEUE_KEY = 'reply_jobs';

export const flowsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/active', async () => {
    const [{ total, flows }, queueDepth, peakInflightToday] = await Promise.all([getActiveReplyFlows(3), redis.llen(REPLY_QUEUE_KEY), getPeakInflightToday()]);

    const queuedCount = flows.filter((flow) => flow.status === 'queued').length;
    const processingCount = flows.filter((flow) => flow.status === 'processing').length;

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
      queue_depth: queueDepth,
      queued_count: queuedCount,
      processing_count: processingCount,
      peak_inflight_today: peakInflightToday,
    };

    return response;
  });
};
