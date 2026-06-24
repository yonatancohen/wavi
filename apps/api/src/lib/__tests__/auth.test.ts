import { describe, it, expect } from 'bun:test';
import type { FastifyRequest } from 'fastify';
import { resolveBearerHeader } from '../auth.js';

function mockRequest(partial: { authorization?: string; rawUrl?: string; url?: string }): FastifyRequest {
  return {
    headers: { authorization: partial.authorization },
    raw: { url: partial.rawUrl },
    url: partial.url ?? partial.rawUrl ?? '/',
  } as FastifyRequest;
}

describe('resolveBearerHeader', () => {
  it('returns Authorization header when present', () => {
    expect(resolveBearerHeader(mockRequest({ authorization: 'Bearer abc' }))).toBe('Bearer abc');
  });

  it('reads ?token= from raw.url for EventSource', () => {
    expect(resolveBearerHeader(mockRequest({ rawUrl: '/api/ingest/g/progress?token=jwt123' }))).toBe('Bearer jwt123');
  });

  it('returns undefined when no credentials', () => {
    expect(resolveBearerHeader(mockRequest({ rawUrl: '/api/groups' }))).toBeUndefined();
  });
});
