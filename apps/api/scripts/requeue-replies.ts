/**
 * Re-enqueue reply jobs for stored messages that never got an answer
 * (e.g. dropped because a second worker stole the job off the shared queue).
 *
 * Pushes jobs onto the SAME `reply_jobs` queue the live worker consumes, so
 * whichever connected worker is running will generate + deliver the reply.
 *
 * Note: `messages` does not persist the WhatsApp message id, so the reply is
 * posted to the group without quoting the original message.
 *
 * Usage (run from apps/api so Bun loads apps/api/.env):
 *   bun run scripts/requeue-replies.ts <messageId> [<messageId> ...]
 */

import { db } from '../src/db/client.js';
import { queueReplyJob } from '../src/lib/reply-queue.js';

const ids = process.argv.slice(2).filter(Boolean);
if (!ids.length) {
  console.error('Usage: bun run scripts/requeue-replies.ts <messageId> [<messageId> ...]');
  process.exit(1);
}

let queued = 0;
for (const id of ids) {
  const { data: msg, error } = await db.from('messages').select('id, group_id, sender_wa_id, sender_name, body, is_agent_reply').eq('id', id).maybeSingle();

  if (error) {
    console.error(`✗ ${id}: lookup failed — ${error.message}`);
    continue;
  }
  if (!msg) {
    console.error(`✗ ${id}: no such message`);
    continue;
  }
  if (msg.is_agent_reply) {
    console.error(`✗ ${id}: that's an agent reply, skipping`);
    continue;
  }

  const { data: group } = await db.from('groups').select('name, wa_group_id, status').eq('id', msg.group_id).maybeSingle();
  if (!group) {
    console.error(`✗ ${id}: group ${msg.group_id} not found`);
    continue;
  }

  await queueReplyJob({
    group_id: msg.group_id,
    group_name: group.name,
    wa_group_id: group.wa_group_id,
    message_id: msg.id,
    sender_wa_id: msg.sender_wa_id,
    sender_name: msg.sender_name ?? msg.sender_wa_id,
    body: msg.body ?? '',
    wa_msg_id: '',
    quoted_message: null,
  });

  queued++;
  console.log(`✓ queued reply for ${id} — ${group.name}: ${(msg.body ?? '').slice(0, 50)}`);
}

console.log(`\nDone. Queued ${queued}/${ids.length} reply job(s).`);
process.exit(0);
