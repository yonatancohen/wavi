import type { FastifyReply, FastifyRequest } from 'fastify';
import { pickDashboardOrigin } from './cors.js';

/** Raw SSE bypasses @fastify/cors — call before writing to reply.raw. */
export function beginSseStream(request: FastifyRequest, reply: FastifyReply): void {
  const origin = pickDashboardOrigin(request.headers.origin);
  reply.hijack();
  reply.raw.setHeader('Access-Control-Allow-Origin', origin);
  reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders();
}

export function writeSseData(reply: FastifyReply, data: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Write SSE when the payload is already a JSON string. */
export function writeSseRaw(reply: FastifyReply, payload: string): void {
  reply.raw.write(`data: ${payload}\n\n`);
}

export function writeSseHeartbeat(reply: FastifyReply): void {
  reply.raw.write(': heartbeat\n\n');
}

export function endSseStream(reply: FastifyReply): void {
  reply.raw.end();
}
