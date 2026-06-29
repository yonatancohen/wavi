import { db } from '../db/client.js';

export interface RotationEntry {
  person_wa_id: string;
  person_name: string;
  item: string;
  brought_at: string;
}

/** Record that someone brought something */
export async function recordRotation(params: { groupId: string; item: string; personWaId: string; personName: string; addedByWaId: string }): Promise<void> {
  await db.from('rotation_log').insert({
    group_id: params.groupId,
    item: normalizeItem(params.item),
    person_wa_id: params.personWaId,
    person_name: params.personName,
    added_by_wa_id: params.addedByWaId,
  });
}

/** Who brought this item last? */
export async function getLastBrought(groupId: string, item: string): Promise<RotationEntry | null> {
  const { data } = await db
    .from('rotation_log')
    .select('person_wa_id, person_name, item, brought_at')
    .eq('group_id', groupId)
    .eq('item', normalizeItem(item))
    .order('brought_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Get the last N people who brought this item (to suggest next turn) */
export async function getRotationHistory(groupId: string, item: string, limit = 5): Promise<RotationEntry[]> {
  const { data } = await db
    .from('rotation_log')
    .select('person_wa_id, person_name, item, brought_at')
    .eq('group_id', groupId)
    .eq('item', normalizeItem(item))
    .order('brought_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

function normalizeItem(item: string): string {
  return item.trim().toLowerCase();
}
