import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/client.js';
import type { RelationshipSignals } from '@wavi/shared';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROXIMITY_MS = 90 * 1000;
const AGREEMENT_KEYWORDS = ['exactly', 'agreed', 'true', 'right', 'כן', 'נכון'];
const DISAGREEMENT_KEYWORDS = ['wrong', 'no way', 'disagree', 'לא נכון', 'טעות'];
const DEFENSE_POSITIVE = ['great', 'good', 'right', 'correct', 'agree', 'support', 'נכון', 'צודק', 'מעולה'];

interface HistoryMessage {
  sender_name: string;
  body: string;
  timestamp: Date;
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

function detectMentions(body: string, members: Map<string, string>): string[] {
  const mentioned: string[] = [];
  for (const [id, name] of members) {
    const pattern = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(body)) mentioned.push(id);
  }
  return mentioned;
}

function countKeywords(body: string, keywords: string[]): number {
  const lower = body.toLowerCase();
  return keywords.reduce((n, kw) => n + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
}

function detectDefense(body: string, targetName: string): boolean {
  const lower = body.toLowerCase();
  if (!lower.includes(targetName.toLowerCase())) return false;
  return DEFENSE_POSITIVE.some((w) => lower.includes(w));
}

export async function buildRelationshipMap(groupId: string, messages: HistoryMessage[]): Promise<void> {
  const members = new Map<string, string>();
  for (const msg of messages) {
    if (!members.has(msg.sender_name)) {
      members.set(msg.sender_name, msg.sender_name);
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
        nameA: members.get(ua) ?? ua,
        nameB: members.get(ub) ?? ub,
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

  // Temporal proximity + @mention attribution
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;

    if (prev && prev.sender_name !== msg.sender_name) {
      const delta = msg.timestamp.getTime() - prev.timestamp.getTime();
      if (delta >= 0 && delta <= PROXIMITY_MS) {
        incrementReply(msg.sender_name, prev.sender_name);
      }
    }

    for (const targetId of detectMentions(msg.body, members)) {
      if (targetId !== msg.sender_name) {
        incrementReply(msg.sender_name, targetId);
      }
    }
  }

  // Agreement / disagreement / defense across all pairs that interact
  for (const msg of messages) {
    for (const [otherId, otherName] of members) {
      if (otherId === msg.sender_name) continue;
      const pair = getPair(msg.sender_name, otherId);
      const bodyLower = msg.body.toLowerCase();

      if (countKeywords(msg.body, AGREEMENT_KEYWORDS) > 0 && bodyLower.includes(otherName.toLowerCase())) {
        pair.signals.agreement_count++;
      }
      if (countKeywords(msg.body, DISAGREEMENT_KEYWORDS) > 0 && bodyLower.includes(otherName.toLowerCase())) {
        pair.signals.disagreement_count++;
      }
      if (detectDefense(msg.body, otherName)) {
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
    const batchNarratives = await generateNarrativesBatch(batch);
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

  await db.from('relationship_map').upsert(rows, {
    onConflict: 'group_id,user_a_wa_id,user_b_wa_id',
  });
}

async function generateNarrativesBatch(pairs: Array<PairData & { interaction_score: number; conflict_score: number; solidarity_score: number }>): Promise<Map<string, string>> {
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
        content: `For each pair below, write ONE sentence of prose describing their group dynamic (max 30 words each). Return JSON array of strings in the same order as the pairs.

${pairDescriptions}

Respond with JSON only: ["sentence 1", "sentence 2", ...]`,
      },
    ],
  });

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
