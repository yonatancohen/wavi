import { mock } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.UPSTASH_REDIS_REST_URL ??= 'http://127.0.0.1';
process.env.UPSTASH_REDIS_REST_TOKEN ??= 'test-redis-token';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.ANTHROPIC_API_KEY ??= 'test-anthropic-key';
process.env.AGENT_ID ??= '00000000-0000-0000-0000-000000000001';

const mockCreateSignedUrl = mock((_path: string, _ttl: number) => Promise.resolve({ data: { signedUrl: 'https://example.com/signed.png' }, error: null }));
const mockUpload = mock(() => Promise.resolve({ error: null }));

mock.module('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

export { mockCreateSignedUrl, mockUpload };
