import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { parseWAExport, chunkMessages, formatChunkForEmbedding } from '../lib/parser.js';
import { embedBatch, embed } from '../lib/embeddings.js';
import { generateEpisodeSummary, generateGroupContext, synthesizeCharacter } from '../ai/summarizer.js';
import { buildUserProfilesFromHistory } from '../ai/profiler.js';
import { buildRelationshipMap } from '../ai/relationships.js';
import { alignExportIdentities } from '../lib/export-alignment.js';
import { resolveExportMessages, collectObservedAliasesByPerson, type ResolvedExportMessage } from '../lib/resolve-export-messages.js';
import { mergeAliases } from '../lib/identity.js';
import type { IngestionProgress, LanguageMode, ParsedWAMessage } from '@wavi/shared';

export async function setIngestionProgress(groupId: string, progress: Partial<IngestionProgress>) {
  const progressKey = `ingestion_progress:${groupId}`;
  await redis.setex(
    progressKey,
    3600,
    JSON.stringify({
      group_id: groupId,
      total_messages: 0,
      processed_messages: 0,
      chunks_embedded: 0,
      stage: 'parsing',
      ...progress,
    }),
  );
}

async function purgeDerivedIntelligence(groupId: string, includeChunks: boolean) {
  const deletes = [
    db.from('episode_summaries').delete().eq('group_id', groupId),
    db.from('user_profiles').delete().eq('group_id', groupId),
    db.from('relationship_map').delete().eq('group_id', groupId),
    db.from('group_contexts').delete().eq('group_id', groupId),
  ];
  if (includeChunks) {
    deletes.unshift(db.from('message_chunks').delete().eq('group_id', groupId));
  }
  await Promise.all(deletes);
}

function prepareResolvedMessages(
  primaryRaw: string,
  supplementalRaw?: string,
): {
  resolved: ResolvedExportMessage[];
  realCount: number;
  alignmentMatches: number;
} {
  const primaryParsed = parseWAExport(primaryRaw);
  let alignment = undefined;
  let alignmentMatches = 0;

  if (supplementalRaw?.trim()) {
    const secondaryParsed = parseWAExport(supplementalRaw);
    alignment = alignExportIdentities(primaryParsed, secondaryParsed);
    alignmentMatches = alignment.matched_message_count;
    console.log(`[Ingest] Export alignment: ${alignmentMatches} matched messages, ${alignment.links.length} identity links`);
  }

  const resolved = resolveExportMessages(primaryParsed, alignment);
  const realCount = resolved.filter((m) => !m.is_system_message).length;
  return { resolved, realCount, alignmentMatches };
}

async function embedMessageChunks(groupId: string, realMessages: ResolvedExportMessage[], setProgress: (p: Partial<IngestionProgress>) => Promise<void>) {
  const chunks = chunkMessages(realMessages, 50, 25);
  const BATCH_SIZE = 10;
  let chunksEmbedded = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const contents = batch.map(formatChunkForEmbedding);
    const pairs = batch.map((chunk, idx) => ({ chunk, content: contents[idx] ?? '' })).filter(({ content }) => content.length > 20);
    if (pairs.length === 0) continue;

    const embeddings = await embedBatch(pairs.map((p) => p.content));
    const rows = pairs.map(({ chunk, content }, idx) => ({
      group_id: groupId,
      content,
      summary: null,
      embedding: JSON.stringify(embeddings[idx]),
      msg_from: chunk[0]?.timestamp.toISOString(),
      msg_to: chunk[chunk.length - 1]?.timestamp.toISOString(),
      members: [...new Set(chunk.map((m) => m.sender_name))],
    }));

    await db.from('message_chunks').insert(rows);
    chunksEmbedded += rows.length;

    await setProgress({
      stage: 'embedding',
      total_messages: realMessages.length,
      processed_messages: Math.min((i + BATCH_SIZE) * 50, realMessages.length),
      chunks_embedded: chunksEmbedded,
    });
  }

  return chunksEmbedded;
}

async function runIntelligenceStages(groupId: string, realMessages: ResolvedExportMessage[], languageMode: LanguageMode, chunksEmbedded: number) {
  const setProgress = (p: Partial<IngestionProgress>) => setIngestionProgress(groupId, p);
  const observedAliases = collectObservedAliasesByPerson(realMessages);

  await setProgress({
    stage: 'profiling',
    processed_messages: realMessages.length,
    chunks_embedded: chunksEmbedded,
  });
  await buildUserProfilesFromHistory(groupId, realMessages, languageMode, observedAliases);

  const episodeSummaries: string[] = [];
  for (let i = 0; i < realMessages.length; i += 100) {
    const slice = realMessages.slice(i, i + 100);
    const content = slice.map((m) => `${m.sender_name}: ${m.body}`).join('\n');
    const summary = await generateEpisodeSummary(content, languageMode);
    episodeSummaries.push(summary);

    const embedding = await embed(summary);
    await db.from('episode_summaries').insert({
      group_id: groupId,
      summary,
      embedding: JSON.stringify(embedding),
      msg_from: slice[0]?.timestamp.toISOString(),
      msg_to: slice[slice.length - 1]?.timestamp.toISOString(),
    });
  }

  await setProgress({ stage: 'relationships' });
  await buildRelationshipMap(groupId, realMessages, languageMode, observedAliases);

  await setProgress({ stage: 'context' });
  const { data: group } = await db.from('groups').select('name').eq('id', groupId).single();
  const recentContent = episodeSummaries.slice(-5).join('\n\n');
  const { data: prevCtx } = await db.from('group_contexts').select('summary_text').eq('group_id', groupId).order('generated_at', { ascending: false }).limit(1).maybeSingle();

  const contextSummary = await generateGroupContext({
    groupName: group?.name ?? 'the group',
    recentContent,
    previousContext: prevCtx?.summary_text ?? '',
    languageMode,
  });

  await db.from('group_contexts').insert({
    group_id: groupId,
    summary_text: contextSummary,
    character_version: 1,
  });

  await setProgress({ stage: 'synthesizing' });

  const { data: profiles } = await db.from('user_profiles').select('display_name, behavioral_summary').eq('group_id', groupId);
  const { data: groupMeta } = await db.from('groups').select('name, language_mode, character_config').eq('id', groupId).single();
  const prevReplyModel = (groupMeta?.character_config as { reply_model?: string } | null)?.reply_model;

  const character = await synthesizeCharacter({
    groupName: groupMeta?.name ?? 'the group',
    episodeSummaries: episodeSummaries.slice(-10),
    userProfiles: (profiles ?? []).map((p) => `${p.display_name}: ${p.behavioral_summary}`),
    languageMode: groupMeta?.language_mode ?? languageMode,
  });

  await db
    .from('groups')
    .update({
      character_config: {
        ...character,
        preset: 'custom',
        version: 1,
        ...(prevReplyModel ? { reply_model: prevReplyModel } : {}),
      },
    })
    .eq('id', groupId);

  await setProgress({ stage: 'done' });
}

export async function runIngestionFromExport(groupId: string, raw: string, supplementalRaw?: string) {
  try {
    await purgeDerivedIntelligence(groupId, true);
    await setIngestionProgress(groupId, { stage: 'parsing' });

    const { resolved, realCount } = prepareResolvedMessages(raw, supplementalRaw);
    const realMessages = resolved.filter((m) => !m.is_system_message);

    await setIngestionProgress(groupId, { stage: 'embedding', total_messages: realCount });
    const setProgress = (p: Partial<IngestionProgress>) => setIngestionProgress(groupId, p);
    const chunksEmbedded = await embedMessageChunks(groupId, realMessages, setProgress);

    const { data: groupMeta } = await db.from('groups').select('language_mode').eq('id', groupId).single();
    const languageMode = (groupMeta?.language_mode ?? 'he') as LanguageMode;

    await runIntelligenceStages(groupId, realMessages, languageMode, chunksEmbedded);
  } catch (err: unknown) {
    console.error('[Ingest] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    await setIngestionProgress(groupId, { stage: 'error', error: message });
  }
}

/** Align a supplemental export with existing stored messages and merge aliases (no full re-ingest). */
export async function runSupplementalExportAlignment(groupId: string, supplementalRaw: string) {
  try {
    await setIngestionProgress(groupId, { stage: 'parsing' });

    const { data: rows } = await db.from('messages').select('sender_name, sender_wa_id, body, timestamp').eq('group_id', groupId).eq('is_agent_reply', false).order('timestamp', { ascending: true });

    const primaryMessages: ParsedWAMessage[] = (rows ?? []).map((m) => ({
      sender_name: m.sender_name,
      sender_wa_id: m.sender_wa_id ?? undefined,
      body: m.body,
      timestamp: new Date(m.timestamp),
      is_system_message: false,
      is_media_omitted: false,
    }));

    const secondaryParsed = parseWAExport(supplementalRaw);
    const alignment = alignExportIdentities(primaryMessages, secondaryParsed);

    if (alignment.links.length === 0) {
      await setIngestionProgress(groupId, { stage: 'error', error: 'No overlapping messages found — exports may be from different groups or time ranges' });
      return;
    }

    for (const link of alignment.links) {
      const { data: profile } = await db.from('user_profiles').select('id, profile_data, display_name').eq('group_id', groupId).eq('wa_user_id', link.canonical_wa_user_id).maybeSingle();

      if (profile) {
        const existing = (profile.profile_data as { aliases?: string[] })?.aliases ?? [];
        const merged = mergeAliases(existing, link.secondary_label, link.primary_label);
        await db
          .from('user_profiles')
          .update({
            profile_data: { ...(profile.profile_data as object), aliases: merged },
            last_updated: new Date().toISOString(),
          })
          .eq('id', profile.id);
      }
    }

    console.log(`[Ingest] Supplemental alignment: ${alignment.matched_message_count} matches, ${alignment.links.length} links`);
    await setIngestionProgress(groupId, { stage: 'done', total_messages: alignment.matched_message_count });
  } catch (err: unknown) {
    console.error('[Supplemental] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    await setIngestionProgress(groupId, { stage: 'error', error: message });
  }
}

export async function runRebuildFromStoredMessages(groupId: string) {
  try {
    const { data: rows } = await db.from('messages').select('sender_name, sender_wa_id, body, timestamp').eq('group_id', groupId).eq('is_agent_reply', false).order('timestamp', { ascending: true });

    if (!rows || rows.length === 0) {
      await setIngestionProgress(groupId, { stage: 'error', error: 'No stored messages to rebuild from' });
      return;
    }

    const parsed: ParsedWAMessage[] = rows.map((m) => ({
      sender_name: m.sender_name,
      sender_wa_id: m.sender_wa_id ?? undefined,
      body: m.body,
      timestamp: new Date(m.timestamp),
      is_system_message: false,
      is_media_omitted: false,
    }));

    const realMessages = resolveExportMessages(parsed).filter((m) => !m.is_system_message);

    await purgeDerivedIntelligence(groupId, true);
    await setIngestionProgress(groupId, { stage: 'embedding', total_messages: realMessages.length });

    const setProgress = (p: Partial<IngestionProgress>) => setIngestionProgress(groupId, p);
    const chunksEmbedded = await embedMessageChunks(groupId, realMessages, setProgress);

    const { data: groupMeta } = await db.from('groups').select('language_mode').eq('id', groupId).single();
    const languageMode = (groupMeta?.language_mode ?? 'he') as LanguageMode;

    await runIntelligenceStages(groupId, realMessages, languageMode, chunksEmbedded);
  } catch (err: unknown) {
    console.error('[Rebuild] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    await setIngestionProgress(groupId, { stage: 'error', error: message });
  }
}

/** @deprecated use runRebuildFromStoredMessages */
export const runRebuild = runRebuildFromStoredMessages;
