#!/usr/bin/env bun
/**
 * Offline replay harness — prints assembled prompt + Claude reply for test cases.
 *
 * Smoke test:
 *   bun run replay -- --fixtures
 *   bun run replay -- <groupId> --sender "Yoni Cohen" --message "@wavi מי זה Dan Cohen? וואו"
 *
 * Requires ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in apps/api/.env.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_REPLY_MODEL, type ReplyModel } from '@wavi/shared';

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = resolve(__dir, 'replay-fixtures.json');

interface FixtureCase {
  name: string;
  groupId: string;
  sender: string;
  message: string;
  skipClaude?: boolean;
}

function checkEnv(): string | null {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    return `Missing env: ${missing.join(', ')}. Set them in apps/api/.env and retry.`;
  }
  return null;
}

function parseArgs(argv: string[]): { fixtures: boolean; groupId?: string; sender?: string; message?: string } {
  if (argv[0] === '--fixtures' || argv[0] === '-f') {
    return { fixtures: true };
  }

  let groupId: string | undefined;
  let sender: string | undefined;
  let message: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--sender' && argv[i + 1]) {
      sender = argv[++i];
    } else if (arg === '--message' && argv[i + 1]) {
      message = argv[++i];
    } else if (!groupId) {
      groupId = arg;
    } else if (!sender) {
      sender = arg;
    } else {
      message = argv.slice(i).join(' ');
      break;
    }
  }

  return { fixtures: false, groupId, sender, message };
}

async function resolveSenderWaId(groupId: string, sender: string, db: typeof import('../src/db/client.js').db): Promise<{ waId: string; displayName: string }> {
  if (sender.includes('@')) return { waId: sender, displayName: sender };

  const { data: byName } = await db.from('user_profiles').select('wa_user_id, display_name').eq('group_id', groupId).ilike('display_name', sender).maybeSingle();

  if (byName) return { waId: byName.wa_user_id, displayName: byName.display_name };

  const { data: byId } = await db.from('user_profiles').select('wa_user_id, display_name').eq('group_id', groupId).eq('wa_user_id', sender).maybeSingle();

  if (byId) return { waId: byId.wa_user_id, displayName: byId.display_name };

  return { waId: sender, displayName: sender };
}

async function runCase(testCase: FixtureCase) {
  console.log(`\n${'═'.repeat(72)}\nCASE: ${testCase.name}\n${'═'.repeat(72)}`);

  const { db } = await import('../src/db/client.js');
  const { buildPromptContext, buildSystemPrompt, buildConversationTurns } = await import('../src/ai/prompt.js');

  const { waId, displayName } = await resolveSenderWaId(testCase.groupId, testCase.sender, db);

  let ctx;
  try {
    ctx = await buildPromptContext({
      groupId: testCase.groupId,
      senderWaId: waId,
      currentMessage: testCase.message,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to build prompt context: ${msg}`);
    console.error('Check that the groupId exists and has ingested data.');
    return;
  }

  const systemPrompt = buildSystemPrompt(ctx);
  const turns = buildConversationTurns(ctx);

  console.log('\n── SYSTEM PROMPT ──\n');
  console.log(systemPrompt);
  console.log('\n── CONVERSATION TURNS ──\n');
  console.log(JSON.stringify(turns, null, 2));
  console.log(`\n── CURRENT USER TURN ──\n${displayName}: ${testCase.message}`);

  if (testCase.skipClaude || !process.env.ANTHROPIC_API_KEY) {
    console.log('\n(Skipping Claude call — no API key or skipClaude set)');
    return;
  }

  const replyModel: ReplyModel = ctx.character_config?.reply_model ?? DEFAULT_REPLY_MODEL;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: replyModel,
    max_tokens: 500,
    system: systemPrompt,
    messages: [...turns, { role: 'user', content: `${displayName}: ${testCase.message}` }],
  });

  const replyText = response.content[0].type === 'text' ? response.content[0].text : '';
  console.log('\n── CLAUDE REPLY ──\n');
  console.log(replyText);
  console.log(`\nTokens: in=${response.usage.input_tokens} out=${response.usage.output_tokens} model=${replyModel}`);
}

async function main() {
  const envError = checkEnv();
  if (envError) {
    console.error(envError);
    process.exit(1);
  }

  const args = process.argv.slice(2).filter((a) => a !== '--');
  const parsed = parseArgs(args);

  if (parsed.fixtures) {
    let raw: string;
    try {
      raw = readFileSync(FIXTURES_PATH, 'utf-8');
    } catch {
      console.error(`Fixtures file not found: ${FIXTURES_PATH}`);
      process.exit(1);
    }
    const fixtures = JSON.parse(raw) as { cases: FixtureCase[] };
    for (const c of fixtures.cases) {
      await runCase(c);
    }
    return;
  }

  if (!parsed.groupId || !parsed.sender || !parsed.message) {
    console.error('Usage: bun run replay -- <groupId> [--sender name] [--message text]');
    console.error('       bun run replay -- <groupId> <sender> "<message>"');
    console.error('       bun run replay -- --fixtures');
    process.exit(1);
  }

  await runCase({
    name: 'cli',
    groupId: parsed.groupId,
    sender: parsed.sender,
    message: parsed.message,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
