const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

// \b doesn't work for Hebrew (ASCII-only), so use Unicode-aware boundary: start/end or surrounding non-letter chars.
const DEICTIC_WORDS = /(?:^|[\s,!?])(?:מי|מה|מתי|איפה|איך|כמה|למה)(?:[\s,!?]|$)|\b(?:who|what|when|where|how|why|which)\b/i;

/**
 * Returns true for short questions anchored by a question word — these need only
 * a single recent message as context rather than the full 3-message window.
 */
export function isDeictic(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return wordCount <= 8 && DEICTIC_WORDS.test(text);
}

/** Strip agent tag and filler before embedding. */
export function normalizeRagQuery(message: string, recentMessages: { sender_name: string; body: string }[]): string {
  let q = message
    .replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '')
    .replace(/@\d{5,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const filler = /^(וואו|wow|היי|hey|please|pls|תגיד|say)\b[!.?\s]*/i;
  q = q.replace(filler, '').trim();

  if (recentMessages.length >= 1 && isDeictic(q)) {
    // Short deictic question: one anchor message is enough; more context dilutes the embedding.
    const last = recentMessages[recentMessages.length - 1];
    q = `${last.sender_name}: ${last.body} | ${q}`;
  } else if (recentMessages.length >= 2) {
    // Longer statement or recall question: full 3-message window.
    const context = recentMessages
      .slice(-3)
      .map((m) => `${m.sender_name}: ${m.body}`)
      .join(' | ');
    q = `${context} | ${q}`;
  }

  return q || message;
}
