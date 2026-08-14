const SIGNAL_KEYWORDS = ['לא נכון', 'בחיים לא', 'לא בא', 'לא מסכים', 'טעות', 'עדיף', 'צריך', 'disagree', 'no way', 'wrong', "don't want"];

const MEDIA_STUB = /^(?:<media|omitted|image omitted|video omitted|audio omitted|sticker omitted)/i;

export type VoiceSampleMessage = {
  sender_name: string;
  body: string;
  is_agent_reply?: boolean;
};

/** Pick a spread of real chat lines for character synthesis — no extra LLM call. */
export function selectVoiceSamples(messages: VoiceSampleMessage[], limit = 20): string[] {
  const scored: Array<{ line: string; sender: string; score: number; index: number }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.is_agent_reply) continue;
    const body = msg.body?.trim() ?? '';
    if (body.length < 20 || body.length > 200) continue;
    if (MEDIA_STUB.test(body)) continue;

    const lower = body.toLowerCase();
    const hit = SIGNAL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
    scored.push({
      line: `${msg.sender_name}: ${body}`,
      sender: msg.sender_name,
      score: hit ? 2 : 1,
      index: i,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: string[] = [];
  const perSender = new Map<string, number>();
  for (const row of scored) {
    if (picked.length >= limit) break;
    const used = perSender.get(row.sender) ?? 0;
    if (used >= 4 && picked.length < limit - 2) continue;
    picked.push(row.line);
    perSender.set(row.sender, used + 1);
  }

  return picked;
}
