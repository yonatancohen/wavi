import type { InboundMessage, InboundReaction } from './provider.js';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { appendToChunkBuffer } from '../jobs/chunker.js';
import { isGroupReplyEnabled, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '@wavi/shared';
import { isAgentTagged, getAgentUserIds } from './agent-identity.js';
import { checkInputGuard } from '../ai/guard.js';
import { recordFailedReply } from '../lib/failed-replies.js';
import type { LanguageMode } from '@wavi/shared';
import { addProfileAliases, findProfileByNameOrAlias, findProfileForReconciliation, getProfileAliases } from '../lib/alias-store.js';
import { extractMentionLabels, mergeAliases, pairMentionLabelsWithIds } from '../lib/identity.js';
import type { UserProfileData } from '@wavi/shared';
import { resolveReminderCommand } from '../lib/reminder-handler.js';

const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

function waUserId(jid: string): string {
  return jid.split('@')[0] ?? jid;
}

// ── Identity reconciliation ───────────────────────────────────
async function reconcileUserIdentity(groupId: string, senderWaId: string, displayName: string) {
  if (!displayName || displayName === senderWaId) return;

  const waUserId = senderWaId.split('@')[0] ?? senderWaId;
  const cacheKey = `reconciled:${groupId}:${waUserId}`;
  if (await redis.exists(cacheKey)) return;

  const { data: alreadyKeyed } = await db.from('user_profiles').select('id, display_name, profile_data').eq('group_id', groupId).eq('wa_user_id', waUserId).maybeSingle();

  if (alreadyKeyed) {
    // Update display name to live push name and record old export label as alias
    if (alreadyKeyed.display_name !== displayName) {
      await addProfileAliases(groupId, waUserId, alreadyKeyed.display_name);
      await db.from('user_profiles').update({ display_name: displayName, last_updated: new Date().toISOString() }).eq('id', alreadyKeyed.id).eq('group_id', groupId);
    }
    await redis.setex(cacheKey, 86400, '1');
    return;
  }

  const profile = await findProfileForReconciliation(groupId, displayName, waUserId);

  if (!profile || isWaJid(profile.wa_user_id)) {
    await redis.setex(cacheKey, 3600, '0');
    return;
  }

  const oldId = profile.wa_user_id;
  const oldDisplay = profile.display_name;
  const existingAliases = getProfileAliases(profile.profile_data as UserProfileData);
  const mergedAliases = mergeAliases(existingAliases, oldDisplay, oldId);

  await db
    .from('user_profiles')
    .update({
      wa_user_id: waUserId,
      display_name: displayName,
      profile_data: { ...(profile.profile_data as object), aliases: mergedAliases },
      last_updated: new Date().toISOString(),
    })
    .eq('id', profile.id)
    .eq('group_id', groupId);
  await reconcileRelationshipIds(groupId, oldId, waUserId, displayName);

  console.log(`[Reconcile] Updated wa_user_id "${oldId}" → ${waUserId} (${displayName}) in group ${groupId}`);
  await redis.setex(cacheKey, 86400, '1');
}

/** Mine @mention contact labels from live messages → aliases on mentioned profiles. */
async function mineMentionAliases(groupId: string, body: string, mentionedIds: string[]) {
  if (!mentionedIds.length) return;
  const labels = extractMentionLabels(body);
  const pairs = pairMentionLabelsWithIds(labels, mentionedIds);
  for (const { waId, label } of pairs) {
    await addProfileAliases(groupId, waId, label);
  }
}

function isWaJid(id: string): boolean {
  return id.includes('@');
}

function detectRoastCommand(body: string): { target: string } | null {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();
  const en = stripped.match(/^roast\s+(.+)$/i);
  if (en) return { target: en[1].trim() };
  const he = stripped.match(/^(?:תעשה\s+רוסט\s+על|רוסט\s+על|תצחק\s+על|תעלה\s+על|תדפוק\s+את)\s+(.+)$/);
  if (he) return { target: he[1].trim() };
  return null;
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

  // Dedup by waMsgId — SET NX avoids a separate EXISTS round-trip.
  const dedupKey = `msg_dedup:${msg.waMsgId}`;
  const deduped = await redis.set(dedupKey, '1', { ex: 3600, nx: true });
  if (deduped === null) return;

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

  mineMentionAliases(group.id, body, msg.mentionedIds).catch((err) => {
    console.error('[Alias] Mention mining failed:', err);
  });

  const tagged = isAgentTagged(msg, body);
  if (!tagged) {
    // Detect text-based negative reactions to recent Wavi replies (e.g. "wtf wavi, that was off")
    import('../ai/worker.js')
      .then(({ checkForNegativeReaction }) => checkForNegativeReaction({ groupId: group.id, senderWaId, body, waGroupId }))
      .catch((err) => console.error('[NegativeReaction] Check failed:', err));

    if (resolvedNameEarly && resolvedNameEarly !== senderWaId) {
      reconcileUserIdentity(group.id, senderWaId, resolvedNameEarly).catch((err) => {
        console.error('[Reconcile] Failed:', err);
      });
    }
    return;
  }

  if (!isGroupReplyEnabled(group.status)) {
    console.log(`[WA] Group not live — ${group.name} (${group.status})`);
    return;
  }

  reconcileUserIdentity(group.id, senderWaId, resolvedNameEarly).catch((err) => {
    console.error('[Reconcile] Failed:', err);
  });

  // Alias commands (WhatsApp-specific — handled locally)
  const aliasHandled = await tryHandleAliasCommand({
    groupId: group.id,
    waGroupId,
    senderWaId,
    body,
    languageMode: (group.language_mode ?? 'he') as LanguageMode,
    waMsgId: msg.waMsgId,
    messageId: stored?.id,
    senderName: resolvedNameEarly,
  });
  if (aliasHandled) return;

  // Reminder commands (WhatsApp-specific — handled locally)
  const reminderHandled = await tryHandleReminderCommand({
    groupId: group.id,
    waGroupId,
    senderWaId,
    senderName: resolvedNameEarly,
    body,
    waMsgId: msg.waMsgId,
    messageId: stored?.id,
  });
  if (reminderHandled) return;

  // All other structured commands — shared with test-reply route via command-resolver
  const { resolveGroupCommand } = await import('../lib/command-resolver.js');
  const cmdResult = await resolveGroupCommand({
    groupId: group.id,
    senderWaId,
    senderName: resolvedNameEarly,
    body,
    languageMode: (group.language_mode ?? 'he') as LanguageMode,
  });
  if (cmdResult.handled) {
    await sendAgentReply(group.id, waGroupId, cmdResult.reply, msg.waMsgId, { messageId: stored?.id, triggerName: resolvedNameEarly, triggerBody: body });
    return;
  }

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
      const rateLimitReply = getRateLimitResponse(group.character_config);
      await db.from('messages').insert({
        group_id: group.id,
        sender_wa_id: 'agent',
        sender_name: AGENT_NAME,
        body: rateLimitReply,
        is_agent_reply: true,
        timestamp: new Date().toISOString(),
      });

      const { sendReply } = await import('./client.js');
      try {
        await sendReply(waGroupId, rateLimitReply, msg.waMsgId);
      } catch (err) {
        await recordFailedReply({ group_id: group.id, message_id: stored?.id, stage: 'delivery', error: err, attempted_body: rateLimitReply, trigger_name: senderName, trigger_body: body });
      }
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
    try {
      await sendReply(waGroupId, guard.deflection, msg.waMsgId);
    } catch (err) {
      await recordFailedReply({ group_id: group.id, message_id: stored?.id, stage: 'delivery', error: err, attempted_body: guard.deflection, trigger_name: senderName, trigger_body: body });
    }
    return;
  }

  const roastTarget = detectRoastCommand(body);
  const effectiveBody = roastTarget ? `[ROAST: Be funny and specific about "${roastTarget.target}" — 1-2 sentences max, use what you know about them] ${body}` : body;

  const { queueReplyJob } = await import('../lib/reply-queue.js');
  await queueReplyJob({
    group_id: group.id,
    group_name: group.name,
    wa_group_id: waGroupId,
    message_id: stored?.id,
    sender_wa_id: senderWaId,
    sender_name: resolvedNameEarly,
    body: effectiveBody,
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

/** @wavi alias "My Love" is Alon  |  @wavi כינוי "אמא" זה Sarah */
function detectAliasCommand(body: string): { alias: string; person: string } | null {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();

  const enMatch = stripped.match(/^alias[:\s]+["']?(.+?)["']?\s+(?:is|=)\s+(.+)$/i);
  if (enMatch) return { alias: enMatch[1].trim(), person: enMatch[2].trim() };

  const heMatch = stripped.match(/^(?:כינוי|alias)[:\s]+["']?(.+?)["']?\s+(?:זה|הוא|היא|is)\s+(.+)$/i);
  if (heMatch) return { alias: heMatch[1].trim(), person: heMatch[2].trim() };

  return null;
}

/**
 * Detect self-introduction phrases: the sender is telling Wavi their own name.
 * EN: "my name is X" / "call me X"
 * HE: "השם שלי הוא X" / "קוראים לי X" / "הכינוי שלי הוא X" / "כינוי שלי הוא X"
 * Returns the claimed name or null.
 */
function detectSelfAliasCommand(body: string): string | null {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();

  const enMatch = stripped.match(/^(?:my\s+name\s+is|call\s+me)\s+(.+)$/i);
  if (enMatch) return enMatch[1].trim();

  const heMatch = stripped.match(/^(?:השם\s+שלי\s+הוא|קוראים\s+לי|הכינוי\s+שלי\s+הוא|כינוי\s+שלי\s+הוא)\s+(.+)$/);
  if (heMatch) return heMatch[1].trim();

  return null;
}

async function tryHandleAliasCommand(params: {
  groupId: string;
  waGroupId: string;
  senderWaId: string;
  body: string;
  languageMode: LanguageMode;
  waMsgId: string;
  messageId?: string | null;
  senderName?: string | null;
}): Promise<boolean> {
  const ctx = { messageId: params.messageId, triggerName: params.senderName, triggerBody: params.body };
  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);

  // Self-introduction: "my name is X" / "קוראים לי X" — add alias to sender's own profile.
  const selfName = detectSelfAliasCommand(params.body);
  if (selfName) {
    await addProfileAliases(params.groupId, waUserId(params.senderWaId), selfName);
    const reply = he ? `סבבה, אזכור שקוראים לך "${selfName}" 👍` : `Got it — I'll remember you as "${selfName}" 👍`;
    await sendAgentReply(params.groupId, params.waGroupId, reply, params.waMsgId, ctx);
    return true;
  }

  const parsed = detectAliasCommand(params.body);
  if (!parsed) return false;

  const profile = await findProfileByNameOrAlias(params.groupId, parsed.person);

  if (!profile) {
    const reply = he ? `לא מצאתי מישהו בשם "${parsed.person}" 😕` : `Couldn't find anyone named "${parsed.person}" 😕`;
    await sendAgentReply(params.groupId, params.waGroupId, reply, params.waMsgId, ctx);
    return true;
  }

  await addProfileAliases(params.groupId, profile.wa_user_id, parsed.alias);
  const reply = he ? `סבבה, "${parsed.alias}" = ${profile.display_name} 👍` : `Got it — "${parsed.alias}" is ${profile.display_name} 👍`;
  await sendAgentReply(params.groupId, params.waGroupId, reply, params.waMsgId, ctx);
  return true;
}

async function sendAgentReply(groupId: string, waGroupId: string, reply: string, waMsgId: string, ctx?: { messageId?: string | null; triggerName?: string | null; triggerBody?: string | null }) {
  await db.from('messages').insert({
    group_id: groupId,
    sender_wa_id: 'agent',
    sender_name: AGENT_NAME,
    body: reply,
    is_agent_reply: true,
    timestamp: new Date().toISOString(),
  });
  const { sendReply } = await import('./client.js');
  try {
    await sendReply(waGroupId, reply, waMsgId);
  } catch (err) {
    await recordFailedReply({
      group_id: groupId,
      message_id: ctx?.messageId ?? null,
      stage: 'delivery',
      error: err,
      attempted_body: reply,
      trigger_name: ctx?.triggerName ?? null,
      trigger_body: ctx?.triggerBody ?? null,
    });
  }
}

async function tryHandleReminderCommand(params: {
  groupId: string;
  waGroupId: string;
  senderWaId: string;
  senderName: string;
  body: string;
  waMsgId: string;
  messageId?: string | null;
}): Promise<boolean> {
  const { handled, reply } = await resolveReminderCommand(params);
  if (!handled) return false;
  await sendAgentReply(params.groupId, params.waGroupId, reply, params.waMsgId, { messageId: params.messageId, triggerName: params.senderName, triggerBody: params.body });
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

// ── Emoji reaction handler (called by WA providers) ───────────

const NEGATIVE_EMOJIS = new Set(['👎', '😡', '🤮', '💩']);
const POSITIVE_EMOJIS = new Set(['👍', '❤️', '🔥', '😂', '🥰', '😍', '🎉']);

export async function handleReaction(reaction: InboundReaction) {
  if (!reaction.waGroupId.endsWith('@g.us')) return;
  if (!reaction.emoji) return; // empty string = reaction removed

  const isNegative = NEGATIVE_EMOJIS.has(reaction.emoji);
  const isPositive = POSITIVE_EMOJIS.has(reaction.emoji);
  if (!isNegative && !isPositive) return;

  const { data: group } = await db.from('groups').select('id').eq('wa_group_id', reaction.waGroupId).maybeSingle();
  if (!group) return;

  // Find pending reply windows for this group
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: `pending_reaction:${group.id}:*`,
      count: 100,
    });
    cursor = Number(nextCursor);
    keys.push(...batch);
  } while (cursor !== 0);

  if (!keys.length) return;

  const { autoInsertMissMemory } = await import('../ai/worker.js');

  if (isNegative) {
    const { data: groupWithConfig } = await db.from('groups').select('character_config').eq('id', group.id).maybeSingle();
    const { generateApology } = await import('../ai/recovery.js');
    const apology = await generateApology((groupWithConfig?.character_config as import('@wavi/shared').CharacterConfig | null) ?? null, group.id).catch(() => 'אוקיי, זה לא נחת טוב. מבין.');

    for (const key of keys) {
      const parts = key.split(':');
      const replyId = parts[parts.length - 1];
      const raw = await redis.get(key);
      const { reply_body } = raw ? (JSON.parse(raw as string) as { wa_group_id: string; reply_body: string }) : { reply_body: '' };

      await db.from('replies').update({ flagged_miss: true }).eq('id', replyId);
      if (reply_body) {
        await autoInsertMissMemory(group.id, reply_body, 'emoji-reaction').catch((err) => {
          console.error('[Reaction] Failed to insert miss memory:', err);
        });
      }
      await redis.del(key);
    }

    const { sendReply } = await import('./client.js');
    await sendReply(reaction.waGroupId, apology).catch((err) => {
      console.error('[Reaction] Failed to send apology:', err);
    });

    await db.from('messages').insert({
      group_id: group.id,
      sender_wa_id: 'agent',
      sender_name: process.env.WA_AGENT_NAME ?? 'wavi',
      body: apology,
      is_agent_reply: true,
      timestamp: new Date().toISOString(),
    });

    console.log(`[Reaction] ${reaction.emoji} — flagged ${keys.length} reply(ies), sent apology for group ${group.id}`);
  } else {
    // Positive reaction — clear the pending window (reply landed well)
    for (const key of keys) {
      await redis.del(key);
    }
  }
}
