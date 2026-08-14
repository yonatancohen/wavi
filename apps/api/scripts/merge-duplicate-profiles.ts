/**
 * Merge same-display-name user_profiles duplicates (export label vs live phone id).
 *
 * Keeps the phone-like wa_user_id when present; otherwise highest msg_count.
 *
 * Usage:
 *   bun scripts/merge-duplicate-profiles.ts -- --name "אדירים" --dry-run
 *   bun scripts/merge-duplicate-profiles.ts -- --name "אדירים"
 *   bun scripts/merge-duplicate-profiles.ts -- --group-id <uuid> --force
 */
import { db } from '../src/db/client.js';
import { isPhoneLikeWaUserId } from '../src/lib/duplicate-profiles.js';
import { mergeDuplicateNameProfiles } from '../src/lib/merge-profiles.js';

function parseArgs(argv: string[]) {
  const out = {
    groupId: null as string | null,
    name: null as string | null,
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group-id') out.groupId = argv[++i] ?? null;
    else if (a === '--name') out.name = argv[++i] ?? null;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--help' || a === '-h') return { help: true as const };
  }
  return out;
}

function requireEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT_ID'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function resolveGroupId(args: { groupId: string | null; name: string | null }): Promise<string> {
  if (args.groupId) return args.groupId;

  if (args.name) {
    const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!).ilike('name', `%${args.name}%`);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; name: string }>;
    if (!rows.length) {
      console.error(`No group matching "${args.name}"`);
      process.exit(1);
    }
    if (rows.length > 1) {
      console.error('Multiple groups match — use --group-id:');
      for (const row of rows) console.error(`  ${row.id}  ${row.name}`);
      process.exit(1);
    }
    return rows[0]!.id;
  }

  const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  if (rows.length !== 1) {
    console.error('Pass --group-id or --name (more than one group exists).');
    process.exit(1);
  }
  return rows[0]!.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ('help' in args) {
    console.log(`Usage: bun scripts/merge-duplicate-profiles.ts -- [--group-id UUID | --name SUBSTRING] [--dry-run] [--force]`);
    process.exit(0);
  }

  requireEnv();
  const groupId = await resolveGroupId(args);
  const { data: group } = await db.from('groups').select('name').eq('id', groupId).single();

  const result = await mergeDuplicateNameProfiles(groupId, { force: args.force, dryRun: args.dryRun });

  console.log(`Group: ${group?.name ?? groupId}`);
  console.log(`Plan: ${result.merges.length} merge(s), ${result.ambiguous.length} ambiguous cluster(s)`);

  if (result.ambiguous.length) {
    console.warn('Skipped ambiguous clusters (2+ phone ids, same display name). Re-run with --force to keep highest msg_count:');
    for (const a of result.ambiguous) {
      console.warn(`  "${a.display_name}": ${a.wa_user_ids.join(', ')}`);
    }
  }

  if (!result.merges.length) {
    console.log(args.dryRun ? 'Nothing to merge (dry-run).' : 'Nothing to merge.');
    return;
  }

  let currentName = '';
  for (const item of result.merges) {
    if (item.display_name !== currentName) {
      currentName = item.display_name;
      const keepKind = isPhoneLikeWaUserId(item.keep_wa_user_id) ? 'phone' : 'label';
      console.log(`\n"${item.display_name}" → keep ${keepKind} id ${item.keep_wa_user_id}`);
    }
    const prefix = args.dryRun ? '  [dry-run]' : '  merged';
    console.log(`${prefix} ${item.merge_wa_user_id} (${item.merge_msg_count} msgs) → ${item.keep_wa_user_id} (${item.keep_msg_count} msgs)`);
  }

  if (args.dryRun) {
    console.log('\nDry-run only — re-run without --dry-run to apply.');
  } else {
    console.log(`\nDone. Merged ${result.merged}. ${result.remaining_profiles ?? '?'} profiles remaining.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
