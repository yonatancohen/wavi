import { createDraftWaGroupId, isDraftGroup } from '@wavi/shared';
import { listGroupChats } from '../whatsapp/client.js';

export { createDraftWaGroupId, isDraftGroup };

export async function assertWaGroupDiscoverable(waGroupId: string): Promise<void> {
  await resolveWaGroupName(waGroupId);
}

/** Current WhatsApp subject for a linked group chat. */
export async function resolveWaGroupName(waGroupId: string): Promise<string> {
  const waGroups = await listGroupChats();
  const found = waGroups.find((g) => g.wa_group_id === waGroupId);
  if (!found) {
    throw new Error('WhatsApp group not found on the linked account. Add Wavi to the group first.');
  }
  return found.name.trim() || 'Unnamed group';
}
