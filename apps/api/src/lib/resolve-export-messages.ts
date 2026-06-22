import type { ParsedWAMessage } from '@wavi/shared';
import type { AlignmentResult } from './export-alignment.js';
import { mergeAliases, resolveSenderIdentity } from './identity.js';

export type ResolvedExportMessage = ParsedWAMessage & {
  sender_wa_id: string;
  /** All sender labels observed for this person in exports. */
  observed_labels: string[];
};

/**
 * Assign canonical wa_user_id to every parsed message and collect observed labels per person.
 */
export function resolveExportMessages(messages: ParsedWAMessage[], alignment?: AlignmentResult): ResolvedExportMessage[] {
  const labelToCanonical = new Map<string, string>();
  const labelsByCanonical = new Map<string, Set<string>>();

  // Seed from alignment (secondary labels → canonical ids)
  if (alignment) {
    for (const link of alignment.links) {
      labelToCanonical.set(link.secondary_label, link.canonical_wa_user_id);
      addLabel(labelsByCanonical, link.canonical_wa_user_id, link.secondary_label);
      addLabel(labelsByCanonical, link.canonical_wa_user_id, link.primary_label);
    }
    for (const [label, id] of alignment.label_to_canonical_id) {
      labelToCanonical.set(label, id);
      addLabel(labelsByCanonical, id, label);
    }
  }

  const resolved: ResolvedExportMessage[] = [];

  for (const msg of messages) {
    if (msg.is_system_message) {
      resolved.push({
        ...msg,
        sender_wa_id: msg.sender_wa_id ?? msg.sender_name,
        observed_labels: [msg.sender_name],
      });
      continue;
    }

    let identity = msg.sender_wa_id ? { wa_user_id: msg.sender_wa_id, display_name: msg.sender_name, id_source: 'phone' as const } : resolveSenderIdentity(msg.sender_name);

    const alignedId = labelToCanonical.get(msg.sender_name);
    if (alignedId) identity = { ...identity, wa_user_id: alignedId };

    addLabel(labelsByCanonical, identity.wa_user_id, msg.sender_name);

    resolved.push({
      ...msg,
      sender_wa_id: identity.wa_user_id,
      observed_labels: [...(labelsByCanonical.get(identity.wa_user_id) ?? new Set())],
    });
  }

  return resolved;
}

/** Build per-person alias lists from resolved export messages (excluding canonical display). */
export function collectObservedAliasesByPerson(messages: ResolvedExportMessage[]): Map<string, string[]> {
  const byPerson = new Map<string, { displayName: string; labels: Set<string> }>();

  for (const msg of messages) {
    if (msg.is_system_message) continue;
    let entry = byPerson.get(msg.sender_wa_id);
    if (!entry) {
      entry = { displayName: msg.sender_name, labels: new Set() };
      byPerson.set(msg.sender_wa_id, entry);
    }
    for (const label of msg.observed_labels) entry.labels.add(label);
    entry.labels.add(msg.sender_name);
    // Prefer phone id display or shortest stable label as display
    if (msg.sender_wa_id.match(/^\d{8,}$/)) {
      entry.displayName = msg.sender_name;
    }
  }

  const result = new Map<string, string[]>();
  for (const [waId, { displayName, labels }] of byPerson) {
    const aliases = mergeAliases([], ...[...labels].filter((l) => l !== displayName));
    result.set(waId, aliases);
  }
  return result;
}

function addLabel(map: Map<string, Set<string>>, waId: string, label: string) {
  if (!map.has(waId)) map.set(waId, new Set());
  map.get(waId)!.add(label);
}
