import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Episode summary (every 100 messages) ─────────────────────

export async function generateEpisodeSummary(content: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `Summarize this WhatsApp group conversation in 2-3 sentences. Focus on: what happened, who was involved, and any decisions or notable moments.\n\n${content.slice(0, 4000)}`,
    }],
  })

  return response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : 'Group activity.'
}

// ── Rolling group context (every 100 messages) ────────────────

export async function generateGroupContext(params: {
  groupName: string
  recentContent: string
  previousContext: string
}): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `You are analyzing a WhatsApp group called "${params.groupName}".

Previous context: ${params.previousContext || 'None'}

Recent conversation:
${params.recentContent.slice(0, 3000)}

Write a SHORT context summary (max 150 words) covering:
- What topics are currently active
- The current tone/energy of the group
- Any ongoing threads or unresolved discussions
- Any memorable recent moments`,
    }],
  })

  return response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : ''
}

// ── Character synthesis (Sonnet — used at setup only) ─────────

export async function synthesizeCharacter(params: {
  groupName:      string
  episodeSummaries: string[]
  userProfiles:   string[]
  languageMode:   string
}): Promise<{
  voice:              string
  opinions:           string[]
  signature_behavior: string
  sliders: {
    formality:    number
    humor:        number
    verbosity:    number
    assertiveness: number
    empathy:      number
  }
}> {
  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are designing an AI persona for a WhatsApp group called "${params.groupName}".

Based on the group's history below, create a character that FITS this group's energy — a slightly exaggerated version of their own vibe.

GROUP HISTORY SUMMARIES:
${params.episodeSummaries.slice(0, 10).join('\n')}

MEMBER PROFILES:
${params.userProfiles.join('\n')}

Respond in valid JSON only (no markdown, no explanation):
{
  "voice": "2-3 sentence description of how this character talks and their personality",
  "opinions": ["opinion 1", "opinion 2", "opinion 3"],
  "signature_behavior": "one specific recurring quirk or behavior",
  "sliders": {
    "formality": <0-100>,
    "humor": <0-100>,
    "verbosity": <0-100>,
    "assertiveness": <0-100>,
    "empathy": <0-100>
  }
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    // Fallback defaults if parsing fails
    return {
      voice: `A friendly, witty member of ${params.groupName} who knows everyone well.`,
      opinions: ['Pineapple does not belong on pizza', 'Sleep is underrated', 'Group chats are better with AI'],
      signature_behavior: 'Ends longer replies with a dry one-liner.',
      sliders: { formality: 30, humor: 70, verbosity: 50, assertiveness: 60, empathy: 65 },
    }
  }
}
