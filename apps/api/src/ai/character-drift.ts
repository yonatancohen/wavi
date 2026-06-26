import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import type { CharacterConfig, VoiceExample } from '@wavi/shared';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DRIFT_COOLDOWN_SECS = 24 * 60 * 60;
const MISS_THRESHOLD = 3; // flagged misses in 7 days before drift kicks in
const EXAMPLES_COOLDOWN_SECS = 24 * 60 * 60;

// ── Character slider drift from flagged misses ─────────────────

/**
 * Checks if enough flagged misses have accumulated in the last 7 days
 * to warrant a small slider adjustment.  Runs at most once per day per group.
 * Honours character_locked — won't touch groups the user has locked.
 */
export async function maybeDriftCharacter(groupId: string): Promise<void> {
  const { data: group } = await db.from('groups').select('character_config, character_locked').eq('id', groupId).maybeSingle();

  if (!group?.character_config || group.character_locked) return;

  const driftKey = `character_drift:${groupId}`;
  if (await redis.exists(driftKey)) return;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db.from('replies').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('flagged_miss', true).gte('created_at', since);

  if ((count ?? 0) < MISS_THRESHOLD) return;

  // Mark cooldown before the async work so concurrent calls don't double-drift.
  await redis.setex(driftKey, DRIFT_COOLDOWN_SECS, '1');

  const { data: missedReplies } = await db.from('replies').select('body').eq('group_id', groupId).eq('flagged_miss', true).gte('created_at', since).limit(5);

  const config = group.character_config as CharacterConfig;
  const drifted = await applyCharacterDrift(groupId, config, (missedReplies ?? []).map((r) => r.body).filter(Boolean));

  await db.from('groups').update({ character_config: drifted }).eq('id', groupId);
  console.log(`[CharacterDrift] Adjusted character for group ${groupId} (${count} misses in 7d, sliders v${drifted.version})`);
}

async function applyCharacterDrift(groupId: string, config: CharacterConfig, missedBodies: string[]): Promise<CharacterConfig> {
  if (!missedBodies.length) return config;

  const { sliders } = config;
  const missesText = missedBodies.map((b, i) => `${i + 1}. "${b}"`).join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are calibrating a WhatsApp group bot's personality after users reacted negatively to some replies.

Failed replies:
${missesText}

Current sliders (0–100):
- formality: ${sliders.formality}
- humor: ${sliders.humor}
- verbosity: ${sliders.verbosity}
- assertiveness: ${sliders.assertiveness}
- empathy: ${sliders.empathy}

Suggest SMALL adjustments (±5–15 points max per slider) that would make the bot less likely to misfire like this.
Return ONLY valid JSON with the adjusted values — every key must be present.
Format: { "formality": N, "humor": N, "verbosity": N, "assertiveness": N, "empathy": N }
Keep all values between 0 and 100.`,
        },
      ],
    });

    const { recordAnthropicCall } = await import('../lib/usage-record.js');
    await recordAnthropicCall({ type: 'synthesis', groupId, usage: response.usage });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return config;

    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const clamp = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
    };

    return {
      ...config,
      sliders: {
        ...sliders,
        formality: clamp(raw.formality, sliders.formality),
        humor: clamp(raw.humor, sliders.humor),
        verbosity: clamp(raw.verbosity, sliders.verbosity),
        assertiveness: clamp(raw.assertiveness, sliders.assertiveness),
        empathy: clamp(raw.empathy, sliders.empathy),
      },
      version: (config.version ?? 1) + 1,
    };
  } catch (err) {
    console.error('[CharacterDrift] Failed to compute drift:', err);
    return config;
  }
}

// ── Dynamic voice examples from recent good replies ────────────

/**
 * Samples 3 recent non-flagged (trigger → reply) pairs and stores them as
 * `character_config.examples` so Claude sees concrete style demonstrations
 * during generation.  Runs at most once per day per group.
 */
export async function maybeCaptureExamples(groupId: string): Promise<void> {
  const { data: group } = await db.from('groups').select('character_config').eq('id', groupId).maybeSingle();

  if (!group?.character_config) return;

  const captureKey = `examples_capture:${groupId}`;
  if (await redis.exists(captureKey)) return;
  await redis.setex(captureKey, EXAMPLES_COOLDOWN_SECS, '1');

  const { data: recent } = await db
    .from('replies')
    .select('body, message_id')
    .eq('group_id', groupId)
    .eq('flagged_miss', false)
    .not('message_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!recent?.length) return;

  const msgIds = recent.map((r) => r.message_id).filter((id): id is string => id !== null);
  if (!msgIds.length) return;

  const { data: triggers } = await db.from('messages').select('id, body, sender_name').in('id', msgIds);

  const triggerMap = Object.fromEntries((triggers ?? []).map((t) => [t.id, t]));

  const examples: VoiceExample[] = recent
    .map((r) => {
      const trigger = r.message_id ? triggerMap[r.message_id] : null;
      if (!trigger?.body || !r.body) return null;
      return {
        user: `${trigger.sender_name ?? 'User'}: ${trigger.body}`,
        agent: r.body,
      };
    })
    .filter((e): e is VoiceExample => e !== null)
    .slice(0, 3);

  if (!examples.length) return;

  const config = group.character_config as CharacterConfig;
  await db
    .from('groups')
    .update({ character_config: { ...config, examples } })
    .eq('id', groupId);

  console.log(`[CharacterDrift] Captured ${examples.length} voice example(s) for group ${groupId}`);
}
