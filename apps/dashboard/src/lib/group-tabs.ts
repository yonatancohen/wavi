export type GroupTab = 'setup' | 'character' | 'people' | 'dynamics' | 'messages' | 'testChat' | 'automations' | 'sync';

export const GROUP_TABS: GroupTab[] = ['setup', 'character', 'people', 'dynamics', 'messages', 'testChat', 'automations', 'sync'];

/**
 * Resolve a Vue Router param value to a valid GroupTab.
 * Accepts the raw `route.params.tab` which may be a string, string[], or undefined.
 * Falls back to 'setup' for anything unrecognised.
 */
export function tabFromParam(param: string | string[] | undefined): GroupTab {
  const id = Array.isArray(param) ? param[0] : param;
  return id && (GROUP_TABS as string[]).includes(id) ? (id as GroupTab) : 'setup';
}
