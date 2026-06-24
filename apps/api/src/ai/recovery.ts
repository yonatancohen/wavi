import Anthropic from '@anthropic-ai/sdk';
import type { CharacterConfig } from '@wavi/shared';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Negative reaction detection ───────────────────────────────

const NEGATIVE_SIGNALS = [
  // English
  /that('s| was| is) (not funny|off|wrong|bad|terrible|awful)/i,
  /bad bot/i,
  /not cool/i,
  /delete that/i,
  /too far/i,
  /uncalled for/i,
  /wtf (wavi|bot)/i,
  /shut up (wavi|bot)/i,
  /@wavi (that was|you are|you're) (wrong|off|bad|awful)/i,
  // Hebrew
  /זה לא מצחיק/,
  /יותר מדי/,
  /לא בסדר/,
  /תמחק את זה/,
];

export function detectNegativeReaction(message: string): boolean {
  return NEGATIVE_SIGNALS.some((pattern) => pattern.test(message));
}

// ── In-character apology ──────────────────────────────────────

export async function generateApology(characterConfig: CharacterConfig | null, groupId?: string): Promise<string> {
  if (!characterConfig) {
    return 'Ok, that was off. My bad.';
  }

  const { sliders, voice } = characterConfig;
  const humor = sliders.humor;
  const formality = sliders.formality;

  // For very high humor characters, we can generate a contextual apology
  // For others, use a deterministic template (cheaper, faster)

  if (humor < 40) {
    // Formal/serious character
    if (formality > 60) {
      return "I apologize — that reply was inappropriate. Let me know if you'd like me to try again.";
    }
    return "That was off, sorry. I'll recalibrate.";
  }

  if (humor > 75) {
    // High humor — generate something in-character
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 80,
        messages: [
          {
            role: 'user',
            content: `You are a witty WhatsApp group bot. Your character: ${voice}
Someone just told you your last message was off or not funny.
Write a SHORT (1-2 sentence) in-character apology that's self-aware and slightly self-deprecating but still on-brand.
Do NOT be overly formal. Stay in character. No quotes.`,
          },
        ],
      });

      const { recordAnthropicCall } = await import('../lib/usage-record.js');
      await recordAnthropicCall({ type: 'recovery', groupId, usage: response.usage });

      return response.content[0].type === 'text' ? response.content[0].text.trim() : fallbackApology(humor);
    } catch {
      return fallbackApology(humor);
    }
  }

  return fallbackApology(humor);
}

function fallbackApology(humor: number): string {
  if (humor > 70) {
    return "Ok ok, that one didn't land. I'll retire that joke. Probably. 😅";
  }
  if (humor > 40) {
    return 'Fair enough — that was a miss. Moving on.';
  }
  return 'Noted. That was off. Sorry.';
}
