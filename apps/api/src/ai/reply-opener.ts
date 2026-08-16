/**
 * Bare "לא," / "Nah," openers are a dry-humor tic: the model rejects a premise
 * that was never asserted. Strip them when the tagged ask is not yes/no.
 */

const EMPTY_DISAGREEMENT = /^(?:לא|nah|nope|no)\s*,\s+/iu;

/** True when the tagged message invites agreement/disagreement (yes/no). */
export function looksLikeYesNoAsk(message: string): boolean {
  const t = message.replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;

  if (/(?:^|[\s,])(?:האם|כן או לא|נכון ש|נכון\?|או לא\?)/i.test(t)) return true;
  if (/\b(?:yes or no|right\?|correct\?|agree\?)\b/i.test(t)) return true;
  if (/^(?:is|are|am|do|does|did|can|could|will|would|should|have|has|was|were)\b/i.test(t)) return true;
  // Short Hebrew polar cues: "צודק?", "מסכים?", "בא לך?"
  if (/^(?:צודק|מסכים|מסכימה|בא לך|רוצה|בטוח)(?:\s|$|[?？])/u.test(t) && /[?？]/.test(t)) return true;

  return false;
}

export function hasEmptyDisagreementOpener(reply: string): boolean {
  return EMPTY_DISAGREEMENT.test(reply.trim());
}

/** Drop a leading "לא," / "Nah," when nothing in the ask was there to reject. */
export function stripEmptyDisagreementOpener(reply: string, taggedAsk: string): string {
  const trimmed = reply.trim();
  if (!hasEmptyDisagreementOpener(trimmed)) return reply;
  if (looksLikeYesNoAsk(taggedAsk)) return reply;

  const stripped = trimmed.replace(EMPTY_DISAGREEMENT, '');
  // Keep the original if stripping would empty or gut the message.
  if (stripped.length < 8) return reply;
  return stripped;
}
