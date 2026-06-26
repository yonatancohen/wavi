const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

// \b doesn't work for Hebrew (ASCII-only), so use Unicode-aware boundary: start/end or surrounding non-letter chars.
const DEICTIC_WORDS = /(?:^|[\s,!?])(?:מי|מה|מתי|איפה|איך|כמה|למה)(?:[\s,!?]|$)|\b(?:who|what|when|where|how|why|which)\b/i;

// Phrases that signal the user wants Wavi to recall a specific past event.
// These queries must be embedded WITHOUT recent-message context — prepending
// unrelated chit-chat drags the vector away from the target memory topic.
//
// Hebrew patterns cover:
//   • Explicit history-search commands  (תחפש/חפש/תמצא בהיסטוריה, ננסה לחפש)
//   • "Last time" phrases               (בפעם האחרונה, פעם אחרונה ש-)
//   • Past-tense "we did" verbs         (הלכנו/נסענו/טסנו/היינו/אכלנו/...)
//   • Past-tense "I/you were" forms     (הייתי/הייתם/הייתן)
//   • Memory/remind triggers            (זוכר/זוכרת/תזכיר/תזכור/זכור)
//   • "When was it" phrases             (מתי זה היה/קרה, מתי הייתם)
//   • Named past event nouns            (הטיול/החופשה/הנסיעה/הביקור/הארוחה)
//
// English patterns cover:
//   • Explicit history-search commands  (search the history, look in the chat)
//   • "Last time/year/summer" phrases   (last time, last year, last summer)
//   • Recall verbs                      (remind me, remember when, do you recall)
//   • "When did we/were we" phrases     (when did we, when were we, when was the last)
//   • Past "we did" phrases             (went to, we visited, we ate at, we flew)
//   • Trip/event nouns                  (the trip to, the vacation, that time we)
// Hebrew: explicit search | last-time phrases | past-tense we-verbs | I/you-were | remember | when-was | event nouns
const RECALL_HE =
  /(?:^|[\s,])(?:(?:תחפש|תחפשי|חפש|חפשי|תמצא|מצא)(?:\s+(?:לי\s+)?(?:ב(?:היסטוריה|צ'אט|הודעות)))?|(?:ננסה\s+ל|בוא\s+נ|בואי\s+נ|אפשר\s+ל)(?:חפש|מצוא)|(?:ב)?פעם\s+(?:ה)?אחרונה(?:\s+ש)?|(?:הלכנו|נסענו|טסנו|אכלנו|שתינו|ביקרנו|ראינו|עשינו|היינו|חגגנו|קנינו|נפגשנו|טיילנו|ישנו|שיחקנו|שחינו|הזמנו|עברנו|חזרנו|נכנסנו|יצאנו|הגענו|עלינו|ירדנו|רצנו)|(?:הייתי|הייתם|הייתן)|(?:זוכר|זוכרת|זוכרים|תזכיר|תזכור|זכור)|(?:מתי\s+(?:זה\s+)?(?:היה|קרה|הייתם|היינו|הלכנו|נסענו|טסנו|אכלנו))|(?:כש(?:הלכנו|נסענו|טסנו|היינו|אכלנו|ביקרנו|עשינו))|(?:ה(?:טיול|נסיעה|טיסה|חופשה|ביקור|ארוחה|מסיבה|אירוע|יציאה)))(?:[\s,?!]|$)/i;

// English: explicit search | last-time/year | remind/remember | when-did/were | past we-verbs | standalone went-to | trip nouns | that-time | ago
const RECALL_EN =
  /\b(?:(?:search|look)\s+(?:(?:in\s+)?(?:the\s+)?)?(?:history|chat|messages|logs?)|check\s+(?:the\s+)?(?:history|chat|messages|logs?)|last\s+(?:time|year|summer|winter|month|week|trip|vacation|visit)|(?:remind|tell)\s+me\s+(?:about|when|what|where)|remember\s+when|do\s+you\s+(?:remember|recall|know\s+when)|when\s+(?:did\s+(?:we|you|i)|were\s+(?:we|you)|was\s+the\s+last|was\s+it)|(?:did|have)\s+(?:we|you|i)\s+(?:ever\s+)?(?:go|eat|visit|travel|fly|stay)\b|(?:we|i)\s+(?:went|ate|visited|traveled|flew|stayed|were)\s+(?:to|at|in)\b|went\s+to\b|(?:the\s+)?(?:trip|vacation|holiday|visit|dinner|outing)\s+(?:to|in|at|when|we)\b|that\s+time\s+(?:we|i|you)\b|back\s+when\b|(?:a\s+)?(?:few\s+)?(?:months?|years?|weeks?|summers?)\s+ago)\b/i;

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
