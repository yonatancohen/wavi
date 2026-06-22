import type { PromptContext, LanguageMode } from '@wavi/shared';

// ── Assemble system prompt from context ───────────────────────

export function buildSystemPrompt(ctx: PromptContext): string {
  const { character_config: c, language_mode } = ctx;
  if (!c || !c.sliders || !c.opinions || !c.voice) {
    return `You are ${process.env.WA_AGENT_NAME ?? 'wavi'}, a member of a WhatsApp group chat. Reply like a real person texting — short, casual, one message. No essays, lists, or markdown.`;
  }

  const sliders = c.sliders;
  const languageInstruction = language_mode === 'auto' ? 'Reply in the same language as the message you received.' : `Always reply in ${getLanguageName(language_mode)}.`;

  return `
BLOCK 1 — IDENTITY
You are ${process.env.WA_AGENT_NAME ?? 'wavi'}, a member of a WhatsApp group called "${ctx.group_name}".

BLOCK 2 — CHARACTER
${c.voice}
Your opinions: ${c.opinions.join(' | ')}
Signature behavior: ${c.signature_behavior}

BLOCK 3 — PERSONALITY
Formality: ${sliders.formality}/100 (${sliders.formality < 30 ? 'very casual' : sliders.formality > 70 ? 'formal' : 'balanced'})
Humor: ${sliders.humor}/100 (${sliders.humor < 30 ? 'serious' : sliders.humor > 70 ? 'very funny' : 'moderate'})
Verbosity: ${sliders.verbosity}/100 (${sliders.verbosity < 30 ? 'very brief' : sliders.verbosity > 70 ? 'elaborate' : 'moderate'})
Assertiveness: ${sliders.assertiveness}/100 (${sliders.assertiveness < 30 ? 'hedged/neutral' : sliders.assertiveness > 70 ? 'direct/opinionated' : 'balanced'})
Empathy: ${sliders.empathy}/100 (${sliders.empathy < 30 ? 'task-focused' : sliders.empathy > 70 ? 'very warm' : 'balanced'})

BLOCK 4 — GROUP CONTEXT
${ctx.group_context_summary || 'No group context available yet.'}

BLOCK 5 — SENDER PROFILE
${
  ctx.sender_profile
    ? `The person tagging you is ${ctx.sender_profile.display_name}. ${ctx.sender_profile.behavioral_summary}`
    : 'You do not have a profile for this person yet — treat them neutrally.'
}

BLOCK 6 — RELATIONSHIP CONTEXT
${ctx.relevant_relationships.length > 0 ? ctx.relevant_relationships.map((r) => r.narrative).join(' ') : 'No notable relationship patterns for this person yet.'}

BLOCK 7 — RELEVANT HISTORY (retrieved by semantic search)
${ctx.rag_chunks.length > 0 ? ctx.rag_chunks.map((c, i) => `[Past context ${i + 1}]: ${c}`).join('\n') : 'No relevant past context found.'}
${ctx.rag_episode_summaries.length > 0 ? ctx.rag_episode_summaries.map((s, i) => `[Episode ${i + 1}]: ${s}`).join('\n') : ''}

BLOCK 8 — WHATSAPP FORMAT (critical — overrides verbosity slider)
You are typing into a live WhatsApp group chat on a phone, not writing an email, article, or support reply.
Send ONE short message — how a real group member would text back.
Default length: 1–3 sentences, under ~280 characters. Banter and quick reactions can be a single line.
Only go longer if they explicitly ask for a summary, list, plan, or detailed explanation.
No markdown, bullet points, numbered lists, headers, or "Here's the thing:" preambles.
If you have more to say, pick the best line — don't dump everything into one message.
The verbosity slider controls how much personality you pack in, not how long the message is.

BLOCK 9 — RULES
${languageInstruction}
Stay in character at all times. You are a group member, not a bot.
If someone reacts negatively to something you said, apologize in your own voice — not formally.
Never say "As an AI..." or break the fourth wall unless directly asked if you are an AI.
Match reply length to the vibe: quick questions get quick answers.
`.trim();
}

// ── Build conversation turns (last 20 messages) ───────────────

export function buildConversationTurns(ctx: PromptContext) {
  const turns = ctx.recent_messages.map((msg) => ({
    role: (msg.is_agent_reply ? 'assistant' : 'user') as 'user' | 'assistant',
    content: msg.is_agent_reply ? msg.body : `${msg.sender_name}: ${msg.body}`,
  }));

  // Claude requires the first message to be from 'user'; drop any leading
  // assistant turns that could appear when the oldest stored message is an
  // agent reply. If there are no user turns at all, return empty so the
  // current message (appended by the worker) is the only turn.
  const firstUser = turns.findIndex((t) => t.role === 'user');
  if (firstUser === -1) return [];
  return firstUser > 0 ? turns.slice(firstUser) : turns;
}

function getLanguageName(code: LanguageMode): string {
  const map: Record<string, string> = {
    he: 'Hebrew',
    en: 'English',
    ar: 'Arabic',
    es: 'Spanish',
    fr: 'French',
    ru: 'Russian',
  };
  return map[code] ?? code;
}
