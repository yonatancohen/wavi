/** Map PostgREST / Postgres errors to actionable API messages. */
export function friendlyDbError(error: { message?: string; code?: string }): string {
  const msg = error.message ?? 'Database error';

  if (msg.includes('image_generation_enabled')) {
    return (
      'Missing database column groups.image_generation_enabled. ' +
      'Run in Supabase SQL editor: ALTER TABLE groups ADD COLUMN IF NOT EXISTS image_generation_enabled boolean NOT NULL DEFAULT false; ' +
      "Then: NOTIFY pgrst, 'reload schema';"
    );
  }

  if (msg.includes('web_search_enabled')) {
    return (
      'Missing database column groups.web_search_enabled. ' +
      'Run in Supabase SQL editor: ALTER TABLE groups ADD COLUMN IF NOT EXISTS web_search_enabled boolean DEFAULT false; ' +
      "Then: NOTIFY pgrst, 'reload schema';"
    );
  }

  return msg;
}
