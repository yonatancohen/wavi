const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

// \b doesn't work for Hebrew (ASCII-only), so use Unicode-aware boundary: start/end or surrounding non-letter chars.
const DEICTIC_WORDS = /(?:^|[\s,!?])(?:מי|מה|מתי|איפה|איך|כמה|למה)(?:[\s,!?]|$)|\b(?:who|what|when|where|how|why|which)\b/i;

// Phrases that signal the user wants Wavi to recall a specific past event.
// These queries must be embedded WITHOUT recent-message context — prepending
// unrelated chit-chat drags the vector away from the target memory topic.
const RECALL_HE =
  /(?:^|[\s,])(?:בפעם האחרונה|הפעם האחרונה|הייתם|הייתי|היינו|הלכנו|נסענו|טסנו|אכלנו|שתינו|ביקרנו|ראינו|עשינו|זוכר|תזכיר|תזכור|כשהיינו|כשהלכנו|כשנסענו|פעם שהלכנו|מתי הלכנו|מתי נסענו)(?:[\s,?!]|$)/i;
const RECALL_EN =
  /\b(?:last time|remind me|remember when|when did (?:we|you|i)|did (?:we|you|i) (?:ever |go |eat |visit |go to )|went to|back when|time (?:we|you|i) (?:went|ate|visited|traveled|flew))\b/i;

/**
 * Returns true for short questions anchored by a question word — these need only
 * a single recent message as context rather than the full 3-message window.
 */
export function isDeictic(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return wordCount <= 8 && DEICTIC_WORDS.test(text);
}

/**
 * Returns true when the message is asking Wavi to recall a past event.
 * For these queries, recent-message context must NOT be prepended — unrelated
 * chat dilutes the embedding away from the target memory.
 */
export function isRecallQuery(text: string): boolean {
  return RECALL_HE.test(text) || RECALL_EN.test(text);
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

  // Recall queries ("last time abroad", "הלכנו למסעדה") must be embedded alone.
  // Prepending recent context — which is typically unrelated current chat —
  // shifts the vector away from the historical memory we're trying to retrieve.
  if (isRecallQuery(q)) {
    return q || message;
  }

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
