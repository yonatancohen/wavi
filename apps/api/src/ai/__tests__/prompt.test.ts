import { describe, expect, it } from 'bun:test';
import { buildConversationTurns, buildSystemPrompt } from '../prompt-build.js';
import type { PromptContext } from '@wavi/shared';

// ── Helpers ───────────────────────────────────────────────────

function makeMessage(body: string, is_agent_reply: boolean, sender_name = 'Alice') {
  return {
    id: crypto.randomUUID(),
    group_id: 'g1',
    sender_wa_id: '972501234567',
    sender_name,
    body,
    is_agent_reply,
    flagged_miss: false,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    character_config: null as any,
    group_name: 'Test Group',
    language_mode: 'auto',
    group_context_summary: '',
    sender_profile: null as any,
    relevant_relationships: [],
    group_memories: [],
    rag_chunks: [],
    rag_episode_summaries: [],
    recent_messages: [],
    current_message: 'hello',
    ...overrides,
  };
}

// ── buildConversationTurns ────────────────────────────────────

describe('buildConversationTurns', () => {
  it('maps user messages to role:user', () => {
    const ctx = makeContext({
      recent_messages: [makeMessage('hey', false, 'Bob')],
    });
    const turns = buildConversationTurns(ctx);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe('user');
    expect(turns[0].content).toBe('Bob: hey');
  });

  it('maps agent replies to role:assistant', () => {
    const ctx = makeContext({
      recent_messages: [makeMessage('what time is it?', false, 'Bob'), makeMessage('no idea, check your phone', true)],
    });
    const turns = buildConversationTurns(ctx);
    expect(turns).toHaveLength(2);
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].content).toBe('no idea, check your phone');
  });

  it('preserves interleaved order', () => {
    const ctx = makeContext({
      recent_messages: [makeMessage('hello', false, 'Alice'), makeMessage('hey there!', true), makeMessage('how are you?', false, 'Alice')],
    });
    const turns = buildConversationTurns(ctx);
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
  });

  // ── Regression: fix for leading assistant turn ────────────

  it('drops leading assistant turns so the first turn is always user', () => {
    const ctx = makeContext({
      recent_messages: [
        makeMessage('old reply', true), // would be first — must be dropped
        makeMessage('hi from user', false, 'Dan'),
        makeMessage('hi back', true),
      ],
    });
    const turns = buildConversationTurns(ctx);
    expect(turns[0].role).toBe('user');
    expect(turns).toHaveLength(2);
  });

  it('drops multiple consecutive leading assistant turns', () => {
    const ctx = makeContext({
      recent_messages: [makeMessage('agent reply 1', true), makeMessage('agent reply 2', true), makeMessage('user says hi', false, 'Yoni')],
    });
    const turns = buildConversationTurns(ctx);
    expect(turns[0].role).toBe('user');
    expect(turns).toHaveLength(1);
  });

  it('returns empty array when recent_messages is empty', () => {
    const ctx = makeContext({ recent_messages: [] });
    expect(buildConversationTurns(ctx)).toEqual([]);
  });

  it('returns empty array when all messages are agent replies', () => {
    const ctx = makeContext({
      recent_messages: [makeMessage('reply a', true), makeMessage('reply b', true)],
    });
    expect(buildConversationTurns(ctx)).toEqual([]);
  });
});

// ── buildSystemPrompt ─────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('returns a fallback prompt when character_config is null', () => {
    const ctx = makeContext({ character_config: null as any });
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('WhatsApp group chat');
    expect(prompt).toContain('short, casual');
  });

  it('includes all identity and character blocks when config is present', () => {
    const ctx = makeContext({
      character_config: {
        voice: 'Dry and sarcastic.',
        opinions: ['Coffee > tea', 'Tabs > spaces'],
        signature_behavior: 'Ends sentences with an observation no one asked for.',
        sliders: { formality: 20, humor: 80, verbosity: 50, assertiveness: 60, empathy: 40 },
        preset: 'custom',
        version: 1,
      },
      group_name: 'Dev Chat',
      language_mode: 'auto',
    });
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('Dev Chat');
    expect(prompt).toContain('Dry and sarcastic.');
    expect(prompt).toContain('Coffee > tea');
    expect(prompt).toContain('BLOCK 1');
    expect(prompt).toContain('WHATSAPP FORMAT');
    expect(prompt).toContain('BLOCK 9');
  });

  it('uses auto-language instruction when language_mode is auto', () => {
    const ctx = makeContext({
      character_config: {
        voice: 'Cheerful.',
        opinions: ['Pineapple on pizza is fine'],
        signature_behavior: 'Adds a random fun fact.',
        sliders: { formality: 50, humor: 50, verbosity: 50, assertiveness: 50, empathy: 50 },
        preset: 'casual',
        version: 1,
      },
      language_mode: 'auto',
    });
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('same language as the message');
  });

  it('uses explicit language instruction for fixed language_mode', () => {
    const ctx = makeContext({
      character_config: {
        voice: 'Formal.',
        opinions: ['Punctuality matters'],
        signature_behavior: 'Uses bullet points.',
        sliders: { formality: 80, humor: 10, verbosity: 60, assertiveness: 70, empathy: 40 },
        preset: 'professional',
        version: 1,
      },
      language_mode: 'he',
    });
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('Hebrew');
    expect(prompt).not.toContain('same language');
  });

  it('describes formality correctly at extremes', () => {
    const makeCtxWithFormality = (formality: number) =>
      makeContext({
        character_config: {
          voice: 'Test.',
          opinions: ['opinion'],
          signature_behavior: 'quirk',
          sliders: { formality, humor: 50, verbosity: 50, assertiveness: 50, empathy: 50 },
          preset: 'custom',
          version: 1,
        },
      });

    expect(buildSystemPrompt(makeCtxWithFormality(10))).toContain('very casual');
    expect(buildSystemPrompt(makeCtxWithFormality(90))).toContain('formal');
    expect(buildSystemPrompt(makeCtxWithFormality(50))).toContain('balanced');
  });
});
