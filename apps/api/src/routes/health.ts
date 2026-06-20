import type { FastifyPluginAsync } from 'fastify'

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({
    ok: true,
    ts: new Date().toISOString(),
    dashboard_url: process.env.DASHBOARD_URL?.trim() ?? null,
  }))
}
