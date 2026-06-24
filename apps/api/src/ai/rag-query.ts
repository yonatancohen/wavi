const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

/** Strip agent tag and filler before embedding. */
export function normalizeRagQuery(message: string, recentMessages: { sender_name: string; body: string }[]): string {
  let q = message
    .replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '')
    .replace(/@\d{5,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const filler = /^(וואו|wow|היי|hey|please|pls|תגיד|say)\b[!.?\s]*/i;
  q = q.replace(filler, '').trim();

  if (recentMessages.length >= 2) {
    const context = recentMessages
      .slice(-3)
      .map((m) => `${m.sender_name}: ${m.body}`)
      .join(' | ');
    q = `${context} | ${q}`;
  }

  return q || message;
}
