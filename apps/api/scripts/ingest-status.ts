/**
 * Explain current upload / rebuild (ingest) progress for a group.
 *
 * Usage (from repo root):
 *   bun run ingest:status
 *   bun run ingest:status -- --group-id <uuid>
 *   bun run ingest:status -- --name "אדיר"
 *   bun run ingest:status -- --poll 0
 */

import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

const STAGE_ORDER = ['parsing', 'embedding', 'profiling', 'relationships', 'context', 'synthesizing', 'done'];

const STAGE_EXPLAIN: Record<string, string> = {
  parsing: 'Reading and normalizing the export file.',
  embedding: 'Chunking messages and writing embeddings to pgvector.',
  profiling: 'Building member profiles (Claude). Note: UI stays on this label during episode summaries too.',
  relationships: 'Computing pair dynamics and relationship narratives.',
  context: 'Generating group context summary.',
  synthesizing: 'Synthesizing the group character config.',
  done: 'Finished successfully.',
  error: 'Failed — see error field below.',
};

type CliArgs = {
  help?: boolean;
  groupId: string | null;
  name: string | null;
  pollSec: number;
};

type ProgressRow = {
  stage: string;
  processed_messages?: number;
  chunks_embedded?: number;
  error?: string;
};

function usage() {
  console.log(`Usage: bun run ingest:status [--group-id UUID] [--name "partial name"] [--poll seconds]

Loads apps/api/.env. With no flags, shows every group with an active Redis progress key.
`);
}

function parseArgs(argv: string[]): CliArgs | { help: true } {
  const out: CliArgs = { groupId: null, name: null, pollSec: 6 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { help: true };
    if (a === '--group-id') out.groupId = argv[++i] ?? null;
    else if (a === '--name') out.name = argv[++i] ?? null;
    else if (a === '--poll') out.pollSec = Number(argv[++i] ?? 0);
  }
  return out;
}

function requireEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'AGENT_ID'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')}. Run from repo root via: bun run ingest:status`);
    process.exit(1);
  }
}

function redisClient() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

function dbClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function scanProgressKeys(redis: Redis) {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: 'ingestion_progress:*', count: 100 });
    cursor = Number(next);
    keys.push(...batch);
  } while (cursor !== 0);
  return keys.map((k) => k.replace(/^ingestion_progress:/, ''));
}

async function resolveGroupIds(db: ReturnType<typeof dbClient>, redis: Redis, args: CliArgs) {
  if (args.groupId) return [args.groupId];

  if (args.name) {
    const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!).ilike('name', `%${args.name}%`);
    if (error) throw error;
    if (!data?.length) {
      console.error(`No group matching name "${args.name}" for AGENT_ID=${process.env.AGENT_ID}`);
      process.exit(1);
    }
    if (data.length > 1) {
      console.log('Multiple groups matched — pick one with --group-id:\n');
      for (const g of data) console.log(`  ${g.id}  ${g.name}`);
      process.exit(1);
    }
    return [data[0]!.id];
  }

  const active = await scanProgressKeys(redis);
  if (active.length === 0) {
    console.log('No active ingest/rebuild jobs in Redis (no ingestion_progress:* keys).');
    console.log('Tip: pass --group-id <uuid> or --name "partial" to inspect a group anyway.');
    process.exit(0);
  }
  return active;
}

function fmtStageIndex(stage: string) {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1) return null;
  return `${idx + 1}/${STAGE_ORDER.length - 1}`;
}

function isActiveStage(stage: string | undefined) {
  return !!stage && stage !== 'done' && stage !== 'error';
}

async function readDbSnapshot(db: ReturnType<typeof dbClient>, groupId: string) {
  const [{ data: group, error: groupErr }, profilesRes, chunks, episodes, rels, contexts] = await Promise.all([
    db.from('groups').select('id, name, status, member_count, language_mode').eq('id', groupId).eq('agent_id', process.env.AGENT_ID!).maybeSingle(),
    db.from('user_profiles').select('display_name, msg_count').eq('group_id', groupId).order('msg_count', { ascending: false }),
    db.from('message_chunks').select('*', { count: 'exact', head: true }).eq('group_id', groupId),
    db.from('episode_summaries').select('*', { count: 'exact', head: true }).eq('group_id', groupId),
    db.from('relationship_map').select('*', { count: 'exact', head: true }).eq('group_id', groupId),
    db.from('group_contexts').select('*', { count: 'exact', head: true }).eq('group_id', groupId),
  ]);

  if (groupErr) throw groupErr;

  return {
    group,
    profiles: profilesRes.data ?? [],
    counts: {
      chunks: chunks.count ?? 0,
      episodes: episodes.count ?? 0,
      relationships: rels.count ?? 0,
      contexts: contexts.count ?? 0,
    },
  };
}

function inferEpisodeProgress(processedMessages: number, episodeCount: number) {
  const expected = processedMessages > 0 ? Math.ceil(processedMessages / 100) : null;
  if (!expected) return null;
  return { done: episodeCount, expected, pct: Math.min(100, Math.round((episodeCount / expected) * 100)) };
}

function explainVerdict(progress: ProgressRow | null, before: Awaited<ReturnType<typeof readDbSnapshot>>, after: Awaited<ReturnType<typeof readDbSnapshot>>, pollSec: number) {
  if (!progress) {
    return { label: 'IDLE', detail: 'No Redis progress key — no recent upload/rebuild (or TTL expired ~1h after finish).' };
  }

  if (progress.stage === 'done') {
    return { label: 'COMPLETE', detail: 'Job finished. Redis key may linger until TTL expires.' };
  }

  if (progress.stage === 'error') {
    return { label: 'FAILED', detail: progress.error ?? 'Unknown error stored in Redis.' };
  }

  if (pollSec <= 0) {
    return { label: 'IN PROGRESS (unverified)', detail: 'Pass default --poll 6 to detect if the worker is still moving.' };
  }

  const deltaEpisodes = after.counts.episodes - before.counts.episodes;
  const deltaProfiles = after.profiles.length - before.profiles.length;
  const deltaContexts = after.counts.contexts - before.counts.contexts;

  if (deltaEpisodes > 0 || deltaProfiles > 0 || deltaContexts > 0) {
    const parts: string[] = [];
    if (deltaEpisodes) parts.push(`+${deltaEpisodes} episode summaries`);
    if (deltaProfiles) parts.push(`+${deltaProfiles} profiles`);
    if (deltaContexts) parts.push(`+${deltaContexts} group contexts`);
    return { label: 'ALIVE', detail: `DB changed in ${pollSec}s (${parts.join(', ')}). Worker is running.` };
  }

  return {
    label: 'POSSIBLY STUCK',
    detail: `No DB change in ${pollSec}s. May still be in a long LLM call, or the API process restarted mid-job (re-run rebuild/upload).`,
  };
}

async function printGroupReport(groupId: string, pollSec: number) {
  const redis = redisClient();
  const db = dbClient();

  const progressKey = `ingestion_progress:${groupId}`;
  const [progressRaw, ttl] = await Promise.all([redis.get(progressKey), redis.ttl(progressKey)]);
  const progress = progressRaw as ProgressRow | null;

  const before = await readDbSnapshot(db, groupId);

  let after = before;
  if (pollSec > 0 && isActiveStage(progress?.stage)) {
    await new Promise((r) => setTimeout(r, pollSec * 1000));
    after = await readDbSnapshot(db, groupId);
  }

  const verdict = explainVerdict(progress, before, after, pollSec);
  const episodeHint = inferEpisodeProgress(progress?.processed_messages ?? 0, after.counts.episodes);

  console.log('═'.repeat(60));
  console.log(`Group: ${before.group?.name ?? '(unknown)'}  (${groupId})`);
  if (before.group) {
    console.log(`Status: ${before.group.status} · WA members: ${before.group.member_count ?? '?'} · lang: ${before.group.language_mode}`);
  } else {
    console.log('(Group row not found for this AGENT_ID — progress key may be stale)');
  }
  console.log('─'.repeat(60));
  console.log(`Verdict: ${verdict.label}`);
  console.log(`  ${verdict.detail}`);
  console.log('─'.repeat(60));

  if (progress) {
    const step = fmtStageIndex(progress.stage);
    console.log(`Redis stage: ${progress.stage}${step ? ` (step ${step})` : ''}`);
    console.log(`  ${STAGE_EXPLAIN[progress.stage] ?? 'Unknown stage'}`);
    if (progress.error) console.log(`  Error: ${progress.error}`);
    console.log(`  processed_messages: ${progress.processed_messages?.toLocaleString() ?? 0}`);
    console.log(`  chunks_embedded: ${progress.chunks_embedded ?? 0}`);
    console.log(`  TTL: ${ttl > 0 ? `${ttl}s remaining` : 'expired'}`);
  } else {
    console.log('Redis: no ingestion_progress key');
  }

  console.log('─'.repeat(60));
  console.log('Database snapshot:');
  console.log(`  message_chunks:      ${after.counts.chunks}`);
  console.log(`  episode_summaries:   ${after.counts.episodes}${episodeHint ? ` (~${episodeHint.done}/${episodeHint.expected}, ${episodeHint.pct}%)` : ''}`);
  console.log(`  user_profiles:       ${after.profiles.length}`);
  console.log(`  relationship_map:    ${after.counts.relationships}`);
  console.log(`  group_contexts:      ${after.counts.contexts}`);

  if (after.profiles.length) {
    console.log('  Profiles:');
    for (const p of after.profiles) {
      console.log(`    · ${p.display_name} (${p.msg_count?.toLocaleString() ?? 0} msgs)`);
    }
  }

  if (pollSec > 0 && isActiveStage(progress?.stage)) {
    const dEp = after.counts.episodes - before.counts.episodes;
    const dPr = after.profiles.length - before.profiles.length;
    console.log('─'.repeat(60));
    console.log(
      `Poll (${pollSec}s): episodes ${before.counts.episodes} → ${after.counts.episodes} (${dEp >= 0 ? '+' : ''}${dEp}), profiles ${before.profiles.length} → ${after.profiles.length} (${dPr >= 0 ? '+' : ''}${dPr})`,
    );
  }

  console.log('');
}

const parsed = parseArgs(process.argv.slice(2));
if ('help' in parsed && parsed.help) {
  usage();
  process.exit(0);
}

const args = parsed as CliArgs;
requireEnv();
const db = dbClient();
const redis = redisClient();

try {
  const groupIds = await resolveGroupIds(db, redis, args);
  for (const id of groupIds) {
    await printGroupReport(id, args.pollSec);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
