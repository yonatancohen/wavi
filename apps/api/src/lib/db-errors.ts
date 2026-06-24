/** Map PostgREST / Postgres errors to actionable API messages. */
export function friendlyDbError(error: { message?: string; code?: string }): string {
  const msg = error.message ?? 'Database error';
  const code = error.code ?? '';

  if (msg.includes('image_generation_enabled') || code === 'PGRST204') {
    if (msg.includes('image_generation_enabled')) {
      return (
        'Database schema missing groups.image_generation_enabled (or API cache is stale). ' +
        'In Supabase SQL editor run: ALTER TABLE groups ADD COLUMN IF NOT EXISTS image_generation_enabled boolean NOT NULL DEFAULT false; ' +
        "NOTIFY pgrst, 'reload schema'; " +
        'Then in Supabase Dashboard → Project Settings → API → Reload schema.'
      );
    }
  }

  if (msg.includes('web_search_enabled')) {
    return (
      'Database schema missing groups.web_search_enabled (or API cache is stale). ' +
      'Run in Supabase SQL editor: ALTER TABLE groups ADD COLUMN IF NOT EXISTS web_search_enabled boolean DEFAULT false; ' +
      "NOTIFY pgrst, 'reload schema';"
    );
  }

  if (code === 'PGRST116' || msg.includes('0 rows') || msg.includes('multiple (or no) rows')) {
    return 'Group not found for this agent. Check that AGENT_ID on the API matches the group owner.';
  }

  return msg;
}
