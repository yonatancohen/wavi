import type { ParsedWAMessage } from '@wavi/shared';
import { normalizeNameForMatch, resolveSenderIdentity } from './identity.js';

const TIMESTAMP_TOLERANCE_MS = 2000;

export type IdentityLink = {
  /** Canonical wa_user_id from the primary export. */
  canonical_wa_user_id: string;
  /** Observed label in the secondary export for the same person. */
  secondary_label: string;
  /** Observed label in the primary export. */
  primary_label: string;
};

export type AlignmentResult = {
  /** secondary sender label → canonical wa_user_id */
  label_to_canonical_id: Map<string, string>;
  /** All high-confidence cross-export links (for alias mining). */
  links: IdentityLink[];
  matched_message_count: number;
};

function messageFingerprint(msg: ParsedWAMessage): string {
  const ts = Math.floor(msg.timestamp.getTime() / 1000);
  const body = normalizeNameForMatch(msg.body);
  return `${ts}|${body}`;
}

function findSecondaryMatch(primary: ParsedWAMessage, secondaryByFp: Map<string, ParsedWAMessage[]>, used: Set<string>): ParsedWAMessage | null {
  const fp = messageFingerprint(primary);
  const candidates = secondaryByFp.get(fp);
  if (candidates?.length) {
    for (const c of candidates) {
      const key = `${c.timestamp.getTime()}|${c.sender_name}|${c.body}`;
      if (!used.has(key)) {
        used.add(key);
        return c;
      }
    }
  }

  // Fuzzy timestamp match (clock skew / second rounding)
  const targetTs = primary.timestamp.getTime();
  const bodyNorm = normalizeNameForMatch(primary.body);
  for (const [key, list] of secondaryByFp) {
    const [tsStr, body] = key.split('|');
    if (body !== bodyNorm) continue;
    const ts = Number(tsStr) * 1000;
    if (Math.abs(ts - targetTs) <= TIMESTAMP_TOLERANCE_MS) {
      for (const c of list) {
        const usedKey = `${c.timestamp.getTime()}|${c.sender_name}|${c.body}`;
        if (!used.has(usedKey)) {
          used.add(usedKey);
          return c;
        }
      }
    }
  }

  return null;
}

/**
 * Align a secondary group-member export with the primary export.
 * Matches messages on (timestamp, body) and learns label equivalences.
 */
export function alignExportIdentities(primary: ParsedWAMessage[], secondary: ParsedWAMessage[]): AlignmentResult {
  const labelToCanonical = new Map<string, string>();
  const links: IdentityLink[] = [];
  const usedSecondary = new Set<string>();
  let matchedCount = 0;

  const secondaryByFp = new Map<string, ParsedWAMessage[]>();
  for (const msg of secondary) {
    if (msg.is_system_message) continue;
    const fp = messageFingerprint(msg);
    const list = secondaryByFp.get(fp) ?? [];
    list.push(msg);
    secondaryByFp.set(fp, list);
  }

  const primaryIdentity = new Map<string, ReturnType<typeof resolveSenderIdentity>>();
  for (const msg of primary) {
    if (msg.is_system_message) continue;
    if (!primaryIdentity.has(msg.sender_name)) {
      primaryIdentity.set(msg.sender_name, resolveSenderIdentity(msg.sender_wa_id ?? msg.sender_name));
    }
  }

  for (const pMsg of primary) {
    if (pMsg.is_system_message) continue;
    const sMsg = findSecondaryMatch(pMsg, secondaryByFp, usedSecondary);
    if (!sMsg || sMsg.sender_name === pMsg.sender_name) continue;

    matchedCount++;
    const primaryId = resolveSenderIdentity(pMsg.sender_wa_id ?? pMsg.sender_name);
    labelToCanonical.set(sMsg.sender_name, primaryId.wa_user_id);

    links.push({
      canonical_wa_user_id: primaryId.wa_user_id,
      secondary_label: sMsg.sender_name,
      primary_label: pMsg.sender_name,
    });
  }

  return {
    label_to_canonical_id: labelToCanonical,
    links,
    matched_message_count: matchedCount,
  };
}

/** Apply secondary-export alignment: remap sender labels to canonical ids. */
export function applyAlignmentToMessages(messages: ParsedWAMessage[], alignment: AlignmentResult): ParsedWAMessage[] {
  return messages.map((msg) => {
    const canonicalId = alignment.label_to_canonical_id.get(msg.sender_name);
    if (!canonicalId) return msg;
    return {
      ...msg,
      sender_wa_id: canonicalId,
      // Keep original label as observed name — aliases are collected separately
    };
  });
}
