import type { FastifyPluginAsync } from 'fastify';
import { allowedDashboardOrigins } from '../lib/cors.js';
import { db } from '../db/client.js';
import { friendlyDbError } from '../lib/db-errors.js';

function supabaseHost(): string | null {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({
    ok: true,
    ts: new Date().toISOString(),
    dashboard_url: process.env.DASHBOARD_URL?.trim() ?? null,
    cors_origins: allowedDashboardOrigins(),
  }));

  fastify.get('/db', async () => {
    const { data, error } = await db.from('groups').select('id, web_search_enabled, image_generation_enabled').limit(1);

    return {
      ok: !error,
      supabase_host: supabaseHost(),
      error: error ? friendlyDbError(error) : null,
      columns_visible: !error,
      sample: data?.[0] ?? null,
    };
  });
};
