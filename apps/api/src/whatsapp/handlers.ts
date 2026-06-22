import type { InboundMessage } from './provider.js';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { appendToChunkBuffer } from '../jobs/chunker.js';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '@wavi/shared';
import { isAgentTagged, getAgentUserIds } from './agent-identity.js';
import { checkInputGuard } from '../ai/guard.js';
import type { LanguageMode } from '@wavi/shared';

const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

function waUserId(jid: string): string {
  return jid.split('@')[0] ?? jid;
}

// ── Identity reconciliation ───────────────────────────────────
async function reconcileUserIdentity(groupId: string, senderWaId: string, displayName: string) {
  if (!displayName || displayName === senderWaId) return;

  const cacheKey = `reconciled:${groupId}:${senderWaId}`;
  if (await redis.exists(cacheKey)) return;

  const { data: alreadyKeyed } = await db.from('user_profiles').select('id').eq('group_id', groupId).eq('wa_user_id', senderWaId).maybeSingle();

  if (alreadyKeyed) {
    await redis.setex(cacheKey, 86400, '1');
    return;
  }

  const { data: profile } = await db.from('user_profiles').select('id, wa_user_id').eq('group_id', groupId).eq('display_name', displayName).maybeSingle();

  if (!profile || isWaJid(profile.wa_user_id)) {
    await redis.setex(cacheKey, 3600, '0');
    return;
  }

  const oldId = profile.wa_user_id;
  await db.from('user_profiles').update({ wa_user_id: senderWaId }).eq('id', profile.id);
  await reconcileRelationshipIds(groupId, oldId, senderWaId, displayName);

  console.log(`[Reconcile] Updated wa_user_id "${oldId}" → ${senderWaId} in group ${groupId}`);
  await redis.setex(cacheKey, 86400, '1');
}

function isWaJid(id: string): boolean {
  return id.includes('@');
}

async function reconcileRelationshipIds(groupId: string, oldId: string, newId: string, displayName: string) {
  const { data: rows } = await db.from('relationship_map').select('*').eq('group_id', groupId).or(`user_a_wa_id.eq.${oldId},user_b_wa_id.eq.${oldId}`);

  for (const row of rows ?? []) {
    let userA = row.user_a_wa_id === oldId ? newId : row.user_a_wa_id;
    let userB = row.user_b_wa_id === oldId ? newId : row.user_b_wa_id;
    let nameA = row.user_a_wa_id === oldId ? displayName : (row.user_a_name ?? row.user_a_wa_id);
    let nameB = row.user_b_wa_id === oldId ? displayName : (row.user_b_name ?? row.user_b_wa_id);
    let signals = row.signals as {
      reply_count_a_to_b: number;
      reply_count_b_to_a: number;
      agreement_count: number;
      disagreement_count: number;
      defense_count: number;
    };

    if (userA > userB) {
      [userA, userB] = [userB, userA];
      [nameA, nameB] = [nameB, nameA];
      signals = {
        reply_count_a_to_b: signals.reply_count_b_to_a,
        reply_count_b_to_a: signals.reply_count_a_to_b,
        agreement_count: signals.agreement_count,
        disagreement_count: signals.disagreement_count,
        defense_count: signals.defense_count,
      };
    }

    await db.from('relationship_map').delete().eq('id', row.id);

    await db.from('relationship_map').upsert(
      {
        group_id: groupId,
        user_a_wa_id: userA,
        user_b_wa_id: userB,
        user_a_name: nameA,
        user_b_name: nameB,
        interaction_score: row.interaction_score,
        conflict_score: row.conflict_score,
        solidarity_score: row.solidarity_score,
        signals,
        narrative: row.narrative,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'group_id,user_a_wa_id,user_b_wa_id' },
    );
  }
}

export async function handleIncomingMessage(msg: InboundMessage) {
  if (!msg.isGroup) return;

  const waGroupId = msg.waGroupId;
  const senderWaId = msg.senderWaId;
  const body = msg.body;

  // Ignore agent's own messages
  const agentIds = getAgentUserIds();
  if (agentIds.includes(waUserId(senderWaId))) return;

  // Dedup by waMsgId
  const dedupKey = `msg_dedup:${msg.waMsgId}`;
  if (await redis.exists(dedupKey)) return;
  await redis.setex(dedupKey, 3600, '1');

  const { data: group } = await db.from('groups').select('id, name, status, character_config, language_mode').eq('wa_group_id', waGroupId).single();

  if (!group) {
    console.log(`[WA] Group not registered — wa_group_id: ${waGroupId}`);
    return;
  }
  if (group.status === 'paused') {
    console.log(`[WA] Group is paused — ${group.name}`);
    return;
  }

  const resolvedNameEarly = await msg.resolvePushName();
  const senderName = resolvedNameEarly && resolvedNameEarly !== senderWaId ? resolvedNameEarly : senderWaId;

  const { data: stored } = await db
    .from('messages')
    .insert({
      group_id: group.id,
      sender_wa_id: senderWaId,
      sender_name: senderName,
      body,
      is_agent_reply: false,
      timestamp: new Date(msg.timestampMs).toISOString(),
    })
    .select('id')
    .single();

  await appendToChunkBuffer(group.id, {
    sender_wa_id: senderWaId,
    sender_name: senderName,
    body,
    timestamp: new Date(msg.timestampMs),
  });

  const tagged = isAgentTagged(msg, body);
  if (!tagged) {
    if (resolvedNameEarly && resolvedNameEarly !== senderWaId) {
      reconcileUserIdentity(group.id, senderWaId, resolvedNameEarly).catch((err) => {
        console.error('[Reconcile] Failed:', err);
      });
    }
    return;
  }

  reconcileUserIdentity(group.id, senderWaId, resolvedNameEarly).catch((err) => {
    console.error('[Reconcile] Failed:', err);
  });

  // Memory commands (F-06)
  const memoryHandled = await tryHandleMemoryCommand({
    groupId: group.id,
    waGroupId,
    senderWaId,
    senderName: resolvedNameEarly,
    body,
    languageMode: (group.language_mode ?? 'he') as LanguageMode,
    waMsgId: msg.waMsgId,
  });
  if (memoryHandled) return;

  // Bot-loop protection: skip if recent turns are all agent
  if (await isAgentOnlyLoop(group.id)) {
    console.log('[WA] Skipping reply — recent turns are all agent messages');
    return;
  }

  const rateLimitKey = `ratelimit:${group.id}:${senderWaId}`;
  const currentCount = await redis.incr(rateLimitKey);

  if (currentCount === 1) {
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
  }

  if (currentCount > RATE_LIMIT_MAX) {
    if (currentCount === RATE_LIMIT_MAX + 1) {
      await db.from('messages').insert({
        group_id: group.id,
        sender_wa_id: 'agent',
        sender_name: AGENT_NAME,
        body: getRateLimitResponse(group.character_config),
        is_agent_reply: true,
        timestamp: new Date().toISOString(),
      });

      const { sendReply } = await import('./client.js');
      await sendReply(waGroupId, getRateLimitResponse(group.character_config), msg.waMsgId);
    }
    return;
  }

  const guard = checkInputGuard(body, (group.language_mode ?? 'he') as LanguageMode);
  if (guard.blocked) {
    await db.from('messages').insert({
      group_id: group.id,
      sender_wa_id: 'agent',
      sender_name: AGENT_NAME,
      body: guard.deflection,
      is_agent_reply: true,
      timestamp: new Date().toISOString(),
    });
    const { sendReply } = await import('./client.js');
    await sendReply(waGroupId, guard.deflection, msg.waMsgId);
    return;
  }

  const { queueReplyJob } = await import('../lib/reply-queue.js');
  await queueReplyJob({
    group_id: group.id,
    group_name: group.name,
    wa_group_id: waGroupId,
    message_id: stored?.id,
    sender_wa_id: senderWaId,
    sender_name: resolvedNameEarly,
    body,
    wa_msg_id: msg.waMsgId,
    quoted_message: msg.quotedMessage
      ? {
          body: msg.quotedMessage.body,
          sender_wa_id: msg.quotedMessage.senderWaId,
          sender_name: msg.quotedMessage.senderName,
        }
      : null,
  });
}

async function isAgentOnlyLoop(groupId: string): Promise<boolean> {
  const { data: recent } = await db.from('messages').select('is_agent_reply').eq('group_id', groupId).order('timestamp', { ascending: false }).limit(5);

  if (!recent || recent.length < 3) return false;
  return recent.every((m) => m.is_agent_reply);
}

type MemoryCommand = 'remember' | 'forget' | 'recall';

function detectMemoryCommand(body: string): { cmd: MemoryCommand; payload: string } | null {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();

  const rememberMatch = stripped.match(/^(?:remember|זכור|תזכור)[:\s]+(.+)/i);
  if (rememberMatch) return { cmd: 'remember', payload: rememberMatch[1].trim() };

  const forgetMatch = stripped.match(/^(?:forget|שכח|תשכח)[:\s]+(.+)/i);
  if (forgetMatch) return { cmd: 'forget', payload: forgetMatch[1].trim() };

  if (/^(?:what do you remember|מה אתה זוכר|מה את זוכרת)/i.test(stripped)) {
    return { cmd: 'recall', payload: '' };
  }

  return null;
}

async function tryHandleMemoryCommand(params: {
  groupId: string;
  waGroupId: string;
  senderWaId: string;
  senderName: string;
  body: string;
  languageMode: LanguageMode;
  waMsgId: string;
}): Promise<boolean> {
  const parsed = detectMemoryCommand(params.body);
  if (!parsed) return false;

  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);
  let reply: string;

  if (parsed.cmd === 'remember') {
    await db.from('group_memories').insert({
      group_id: params.groupId,
      memory_text: parsed.payload,
      added_by_wa_id: params.senderWaId,
      added_by_name: params.senderName,
    });
    reply = he ? `סבבה, אזכור 👍` : `Got it, I'll remember that 👍`;
  } else if (parsed.cmd === 'forget') {
    const { data: memories } = await db.from('group_memories').select('id, memory_text').eq('group_id', params.groupId);
    const match = (memories ?? []).find((m) => m.memory_text.toLowerCase().includes(parsed.payload.toLowerCase()));
    if (match) {
      await db.from('group_memories').delete().eq('id', match.id);
      reply = he ? `שכחתי ✅` : `Forgot it ✅`;
    } else {
      reply = he ? `לא מצאתי משהו כזה לשכוח` : `Couldn't find that to forget`;
    }
  } else {
    const { data: memories } = await db.from('group_memories').select('memory_text').eq('group_id', params.groupId).order('created_at', { ascending: false }).limit(10);
    if (!memories?.length) {
      reply = he ? 'עדיין לא זכרתי כלום 😄' : "I haven't stored anything yet 😄";
    } else {
      const list = memories.map((m) => `• ${m.memory_text}`).join('\n');
      reply = he ? `זה מה שאני זוכר:\n${list}` : `Here's what I remember:\n${list}`;
    }
  }

  await db.from('messages').insert({
    group_id: params.groupId,
    sender_wa_id: 'agent',
    sender_name: AGENT_NAME,
    body: reply,
    is_agent_reply: true,
    timestamp: new Date().toISOString(),
  });

  const { sendReply } = await import('./client.js');
  await sendReply(params.waGroupId, reply, params.waMsgId);
  return true;
}

function getRateLimitResponse(characterConfig: { sliders?: { humor?: number } } | null): string {
  const humor = characterConfig?.sliders?.humor ?? 50;
  if (humor > 70) {
    return `Easy there — I need a breather. You've hit your limit for the hour. I'll be back. 😤`;
  } else if (humor > 40) {
    return `That's 20 for this hour. Give me a break and try again later.`;
  } else {
    return `You've reached the request limit (20/hour). I'll respond again when the window resets.`;
  }
}
