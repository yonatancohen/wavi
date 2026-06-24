import { createDraftWaGroupId, isDraftGroup } from '@wavi/shared';
import { listGroupChats } from '../whatsapp/client.js';

export { createDraftWaGroupId, isDraftGroup };

export async function assertWaGroupDiscoverable(waGroupId: string): Promise<void> {
  const waGroups = await listGroupChats();
  const found = waGroups.some((g) => g.wa_group_id === waGroupId);
  if (!found) {
    throw new Error('WhatsApp group not found on the linked account. Add Wavi to the group first.');
  }
}
