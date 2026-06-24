/** Baileys exposes participants as a jid→record map; wwebjs uses an array. */
export function participantCountFromWa(participants: unknown): number | null {
  if (participants == null) return null;
  if (Array.isArray(participants)) return participants.length;
  if (typeof participants === 'object') return Object.keys(participants as Record<string, unknown>).length;
  return null;
}
