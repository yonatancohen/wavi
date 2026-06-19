import { db } from '../db/client.js'
import type { UserProfileData } from '@wavi/shared'

interface ProfileMessage {
  body: string
}

export async function profileUser(
  groupId: string,
  waUserId: string,
  displayName: string,
  messages: ProfileMessage[],
): Promise<void> {
  if (messages.length < 5) return

  const sample = messages.slice(-100).map((m) => m.body).join('\n')

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Analyze this person's WhatsApp messages and return JSON only:
{
  "humor_type": "sarcastic|absurdist|self-deprecating|dad-jokes|dry|none",
  "humor_score": <0-100>,
  "formality_score": <0-100>,
  "activity_level": "high|medium|low|lurker",
  "dominant_topics": ["topic1", "topic2"],
  "sensitivity_flags": [],
  "emoji_usage": "heavy|moderate|rare|none",
  "avg_message_length": "long|medium|short|terse",
  "behavioral_summary": "One sentence describing how this person communicates"
}

Messages from ${displayName}:
${sample.slice(0, 2000)}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as UserProfileData & { behavioral_summary?: string }

    await db.from('user_profiles').upsert({
      group_id:           groupId,
      wa_user_id:         waUserId,
      display_name:       displayName,
      profile_data:       parsed,
      behavioral_summary: parsed.behavioral_summary ?? '',
      msg_count:          messages.length,
      last_updated:       new Date().toISOString(),
    }, { onConflict: 'group_id,wa_user_id' })
  } catch {
    // Skip malformed profile
  }
}

export async function buildUserProfilesFromHistory(
  groupId: string,
  messages: Array<{ sender_name: string; body: string; timestamp: Date }>,
) {
  const byUser: Record<string, string[]> = {}
  for (const msg of messages) {
    if (!byUser[msg.sender_name]) byUser[msg.sender_name] = []
    byUser[msg.sender_name].push(msg.body)
  }

  for (const [name, bodies] of Object.entries(byUser)) {
    await profileUser(
      groupId,
      name, // display name placeholder until live reconciliation
      name,
      bodies.map((body) => ({ body })),
    )
  }
}
