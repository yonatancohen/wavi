import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/client.js';
import type { RelationshipSignals, LanguageMode } from '@wavi/shared';
import { extractMentionLabels, messageReferencesName } from '../lib/identity.js';
import type { ResolvedExportMessage } from '../lib/resolve-export-messages.js';
import { synthesisLanguageInstruction } from './language.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROXIMITY_MS = 90 * 1000;
const AGREEMENT_KEYWORDS = ['exactly', 'agreed', 'true', 'right', 'כן', 'נכון'];
const DISAGREEMENT_KEYWORDS = ['wrong', 'no way', 'disagree', 'לא נכון', 'טעות'];
const DEFENSE_POSITIVE = ['great', 'good', 'right', 'correct', 'agree', 'support', 'נכון', 'צודק', 'מעולה'];

interface HistoryMessage {
  sender_wa_id: string;
  sender_name: string;
  body: string;
  timestamp: Date;
}

interface MemberInfo {
  waId: string;
  displayName: string;
  aliases: string[];
}

interface PairData {
  userA: string;
  userB: string;
  nameA: string;
  nameB: string;
  signals: RelationshipSignals;
}

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pairKey(a: string, b: string): string {
  const [ua, ub] = canonicalPair(a, b);
  return `${ua}|${ub}`;
}

function detectMentions(body: string, members: Map<string, MemberInfo>): string[] {
  const mentioned: string[] = [];
  const atLabels = extractMentionLabels(body);

  for (const [id, info] of members) {
    for (const label of atLabels) {
      if (messageReferencesName(label, info.displayName, info.aliases)) {
        mentioned.push(id);
        break;
      }
    }
    if (messageReferencesName(body, info.displayName, info.aliases)) {
      if (!mentioned.includes(id)) mentioned.push(id);
    }
  }
  return mentioned;
}

function countKeywords(body: string, keywords: string[]): number {
  const lower = body.toLowerCase();
  return keywords.reduce((n, kw) => n + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
}

function detectDefense(body: string, target: MemberInfo): boolean {
  if (!messageReferencesName(body, target.displayName, target.aliases)) return false;
  const lower = body.toLowerCase();
  return DEFENSE_POSITIVE.some((w) => lower.includes(w));
}

function toHistoryMessages(messages: ResolvedExportMessage[]): HistoryMessage[] {
  return messages
    .filter((m) => !m.is_system_message)
    .map((m) => ({
      sender_wa_id: m.sender_wa_id,
      sender_name: m.sender_name,
      body: m.body,
      timestamp: m.timestamp,
    }));
}

export async function buildRelationshipMap(
  groupId: string,
  messages: ResolvedExportMessage[] | HistoryMessage[],
  languageMode: LanguageMode = 'auto',
  aliasMap?: Map<string, string[]>,
  options?: { merge?: boolean; pruneStale?: boolean },
): Promise<void> {
  const history: HistoryMessage[] = messages.length > 0 && 'observed_labels' in messages[0] ? toHistoryMessages(messages as ResolvedExportMessage[]) : (messages as HistoryMessage[]);

  if (history.length === 0) return;

  const members = new Map<string, MemberInfo>();
  for (const msg of history) {
    if (!members.has(msg.sender_wa_id)) {
      members.set(msg.sender_wa_id, {
        waId: msg.sender_wa_id,
        displayName: msg.sender_name,
        aliases: aliasMap?.get(msg.sender_wa_id) ?? [],
      });
    }
  }

  const pairs = new Map<string, PairData>();

  const getPair = (fromId: string, toId: string): PairData => {
    const [ua, ub] = canonicalPair(fromId, toId);
    const key = pairKey(fromId, toId);
    let pair = pairs.get(key);
    if (!pair) {
      pair = {
        userA: ua,
        userB: ub,
        nameA: members.get(ua)?.displayName ?? ua,
        nameB: members.get(ub)?.displayName ?? ub,
        signals: {
          reply_count_a_to_b: 0,
          reply_count_b_to_a: 0,
          agreement_count: 0,
          disagreement_count: 0,
          defense_count: 0,
        },
      };
      pairs.set(key, pair);
    }
    return pair;
  };

  const incrementReply = (fromId: string, toId: string) => {
    const pair = getPair(fromId, toId);
    const [ua, ub] = canonicalPair(fromId, toId);
    if (fromId === ua && toId === ub) {
      pair.signals.reply_count_a_to_b++;
    } else {
      pair.signals.reply_count_b_to_a++;
    }
  };

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    const prev = i > 0 ? history[i - 1] : null;

    if (prev && prev.sender_wa_id !== msg.sender_wa_id) {
      const delta = msg.timestamp.getTime() - prev.timestamp.getTime();
      if (delta >= 0 && delta <= PROXIMITY_MS) {
        incrementReply(msg.sender_wa_id, prev.sender_wa_id);
      }
    }

    for (const targetId of detectMentions(msg.body, members)) {
      if (targetId !== msg.sender_wa_id) {
        incrementReply(msg.sender_wa_id, targetId);
      }
    }
  }

  for (const msg of history) {
    for (const [otherId, otherInfo] of members) {
      if (otherId === msg.sender_wa_id) continue;
      const pair = getPair(msg.sender_wa_id, otherId);

      if (countKeywords(msg.body, AGREEMENT_KEYWORDS) > 0 && messageReferencesName(msg.body, otherInfo.displayName, otherInfo.aliases)) {
        pair.signals.agreement_count++;
      }
      if (countKeywords(msg.body, DISAGREEMENT_KEYWORDS) > 0 && messageReferencesName(msg.body, otherInfo.displayName, otherInfo.aliases)) {
        pair.signals.disagreement_count++;
      }
      if (detectDefense(msg.body, otherInfo)) {
        pair.signals.defense_count++;
      }
    }
  }

  const scored = [...pairs.values()].map((pair) => {
    const totalReplies = pair.signals.reply_count_a_to_b + pair.signals.reply_count_b_to_a;
    return {
      ...pair,
      interaction_score: Math.min(1, totalReplies / 50),
      conflict_score: Math.min(1, pair.signals.disagreement_count / 10),
      solidarity_score: Math.min(1, (pair.signals.agreement_count + pair.signals.defense_count) / 20),
    };
  });

  const narrativePairs = scored.filter((p) => p.interaction_score > 0.1);
  const narratives = new Map<string, string>();

  for (let i = 0; i < narrativePairs.length; i += 5) {
    const batch = narrativePairs.slice(i, i + 5);
    const batchNarratives = await generateNarrativesBatch(batch, languageMode, groupId);
    for (const [key, narrative] of batchNarratives) {
      narratives.set(key, narrative);
    }
  }

  const rows = scored.map((pair) => ({
    group_id: groupId,
    user_a_wa_id: pair.userA,
    user_b_wa_id: pair.userB,
    user_a_name: pair.nameA,
    user_b_name: pair.nameB,
    interaction_score: pair.interaction_score,
    conflict_score: pair.conflict_score,
    solidarity_score: pair.solidarity_score,
    signals: pair.signals,
    narrative: narratives.get(pairKey(pair.userA, pair.userB)) ?? '',
    last_updated: new Date().toISOString(),
  }));

  if (rows.length === 0) return;

  const lockedNarratives = new Map<string, { narrative: string; signals: RelationshipSignals }>();
  if (options?.merge) {
    const { data: existingRows } = await db.from('relationship_map').select('user_a_wa_id, user_b_wa_id, narrative, signals').eq('group_id', groupId);
    for (const row of existingRows ?? []) {
      const signals = (row.signals as RelationshipSignals | null) ?? ({} as RelationshipSignals);
      if (signals.curation?.narrative_locked && row.narrative) {
        lockedNarratives.set(pairKey(row.user_a_wa_id, row.user_b_wa_id), { narrative: row.narrative, signals });
      }
    }
  }

  const upsertRows = rows.map((pair) => {
    const key = pairKey(pair.user_a_wa_id, pair.user_b_wa_id);
    const locked = lockedNarratives.get(key);
    if (!locked) return pair;
    return {
      ...pair,
      narrative: locked.narrative,
      signals: { ...pair.signals, curation: locked.signals.curation },
    };
  });

  await db.from('relationship_map').upsert(upsertRows, {
    onConflict: 'group_id,user_a_wa_id,user_b_wa_id',
  });

  if (options?.merge && options.pruneStale) {
    const activeKeys = new Set(upsertRows.map((r) => pairKey(r.user_a_wa_id, r.user_b_wa_id)));
    const { data: existing } = await db.from('relationship_map').select('id, user_a_wa_id, user_b_wa_id').eq('group_id', groupId);
    const staleIds = (existing ?? []).filter((r) => !activeKeys.has(pairKey(r.user_a_wa_id, r.user_b_wa_id))).map((r) => r.id);
    if (staleIds.length > 0) {
      await db.from('relationship_map').delete().in('id', staleIds);
    }
  }
}

/**
 * Incrementally update relationship signals from a small live chunk (50 msgs).
 * Does NOT do a full rebuild — merges new signals into existing DB rows.
 * Called after every chunk flush in the live message pipeline.
 */
export async function updateRelationshipsIncremental(groupId: string, messages: Array<{ sender_wa_id: string; sender_name: string; body: string; timestamp: string }>): Promise<void> {
  if (messages.length < 2) return;

  const memberMap = new Map<string, { waId: string; displayName: string }>();
  for (const m of messages) {
    if (!memberMap.has(m.sender_wa_id)) {
      memberMap.set(m.sender_wa_id, { waId: m.sender_wa_id, displayName: m.sender_name });
    }
  }

  if (memberMap.size < 2) return;

  interface IncrementalPair {
    userA: string;
    userB: string;
    nameA: string;
    nameB: string;
    reply_count_a_to_b: number;
    reply_count_b_to_a: number;
    agreement_count: number;
    disagreement_count: number;
    defense_count: number;
  }

  const pairSignals = new Map<string, IncrementalPair>();

  for (let i = 0; i < messages.length; i++) {
    const curr = messages[i];
    const currTime = new Date(curr.timestamp).getTime();

    for (let j = Math.max(0, i - 5); j < i; j++) {
      const prev = messages[j];
      const prevTime = new Date(prev.timestamp).getTime();
      if (curr.sender_wa_id === prev.sender_wa_id) continue;
      if (currTime - prevTime > PROXIMITY_MS) continue;

      const [uA, uB] = curr.sender_wa_id < prev.sender_wa_id ? [curr.sender_wa_id, prev.sender_wa_id] : [prev.sender_wa_id, curr.sender_wa_id];
      const [nA, nB] = curr.sender_wa_id < prev.sender_wa_id ? [curr.sender_name, prev.sender_name] : [prev.sender_name, curr.sender_name];

      const key = `${uA}|${uB}`;
      if (!pairSignals.has(key)) {
        pairSignals.set(key, {
          userA: uA,
          userB: uB,
          nameA: nA,
          nameB: nB,
          reply_count_a_to_b: 0,
          reply_count_b_to_a: 0,
          agreement_count: 0,
          disagreement_count: 0,
          defense_count: 0,
        });
      }
      const ps = pairSignals.get(key)!;

      if (curr.sender_wa_id === uA) ps.reply_count_a_to_b++;
      else ps.reply_count_b_to_a++;

      const lower = curr.body.toLowerCase();
      if (AGREEMENT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) ps.agreement_count++;
      if (DISAGREEMENT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) ps.disagreement_count++;
    }
  }

  if (pairSignals.size === 0) return;

  for (const [_key, ps] of pairSignals) {
    const { data: existing } = await db.from('relationship_map').select('*').eq('group_id', groupId).eq('user_a_wa_id', ps.userA).eq('user_b_wa_id', ps.userB).maybeSingle();

    const prev = (existing?.signals as RelationshipSignals | null) ?? null;
    const mergedSignals: RelationshipSignals = {
      reply_count_a_to_b: (prev?.reply_count_a_to_b ?? 0) + ps.reply_count_a_to_b,
      reply_count_b_to_a: (prev?.reply_count_b_to_a ?? 0) + ps.reply_count_b_to_a,
      agreement_count: (prev?.agreement_count ?? 0) + ps.agreement_count,
      disagreement_count: (prev?.disagreement_count ?? 0) + ps.disagreement_count,
      defense_count: (prev?.defense_count ?? 0) + ps.defense_count,
      ...(prev?.curation ? { curation: prev.curation } : {}),
    };

    const totalInteractions = mergedSignals.reply_count_a_to_b + mergedSignals.reply_count_b_to_a;
    const interaction_score = Math.min(1, totalInteractions / 50);
    const conflict_score = Math.min(1, mergedSignals.disagreement_count / 10);
    const solidarity_score = Math.min(1, (mergedSignals.agreement_count + mergedSignals.defense_count) / 10);

    await db.from('relationship_map').upsert(
      {
        group_id: groupId,
        user_a_wa_id: ps.userA,
        user_b_wa_id: ps.userB,
        user_a_name: ps.nameA,
        user_b_name: ps.nameB,
        interaction_score,
        conflict_score,
        solidarity_score,
        signals: mergedSignals,
        narrative: existing?.narrative ?? '',
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'group_id,user_a_wa_id,user_b_wa_id' },
    );
  }
}

async function generateNarrativesBatch(
  pairs: Array<PairData & { interaction_score: number; conflict_score: number; solidarity_score: number }>,
  languageMode: LanguageMode = 'auto',
  groupId?: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (pairs.length === 0) return result;

  const pairDescriptions = pairs
    .map((p, idx) => {
      const s = p.signals;
      return `[${idx + 1}] ${p.nameA} & ${p.nameB}: replies A→B=${s.reply_count_a_to_b}, B→A=${s.reply_count_b_to_a}, agreements=${s.agreement_count}, disagreements=${s.disagreement_count}, defenses=${s.defense_count}, interaction=${p.interaction_score.toFixed(2)}, conflict=${p.conflict_score.toFixed(2)}, solidarity=${p.solidarity_score.toFixed(2)}`;
    })
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `${synthesisLanguageInstruction(languageMode)}

For each pair below, write ONE sentence of prose describing their group dynamic (max 30 words each).
Every sentence MUST follow the language rule above.

${pairDescriptions}

Respond with JSON only: ["sentence 1", "sentence 2", ...]`,
      },
    ],
  });

  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId, usage: response.usage });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const sentences = JSON.parse(clean) as string[];
    pairs.forEach((p, idx) => {
      result.set(pairKey(p.userA, p.userB), sentences[idx] ?? '');
    });
  } catch {
    pairs.forEach((p) => result.set(pairKey(p.userA, p.userB), ''));
  }

  return result;
}
