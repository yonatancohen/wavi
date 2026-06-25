import { db } from '../db/client.js';

export interface Reminder {
  id: string;
  group_id: string;
  wa_group_id: string;
  sender_wa_id: string;
  sender_name: string | null;
  reminder_text: string;
  fire_at: string;
  sent_at: string | null;
  created_at: string;
}

export async function createReminder(params: { group_id: string; wa_group_id: string; sender_wa_id: string; sender_name: string; reminder_text: string; fire_at: Date }): Promise<Reminder | null> {
  const { data, error } = await db
    .from('reminders')
    .insert({
      group_id: params.group_id,
      wa_group_id: params.wa_group_id,
      sender_wa_id: params.sender_wa_id,
      sender_name: params.sender_name,
      reminder_text: params.reminder_text,
      fire_at: params.fire_at.toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[ReminderStore] Failed to create reminder:', error);
    return null;
  }
  return data as Reminder;
}

/** Fetch all reminders whose fire_at has passed and haven't been sent yet. */
export async function getDueReminders(): Promise<Reminder[]> {
  const { data, error } = await db.from('reminders').select('*').lte('fire_at', new Date().toISOString()).is('sent_at', null).limit(50);

  if (error) {
    console.error('[ReminderStore] Failed to fetch due reminders:', error);
    return [];
  }
  return (data ?? []) as Reminder[];
}

export async function markReminderSent(id: string): Promise<void> {
  await db.from('reminders').update({ sent_at: new Date().toISOString() }).eq('id', id);
}

/** List pending (unsent, future) reminders for a specific sender in a group. */
export async function getPendingReminders(params: { group_id: string; sender_wa_id: string }): Promise<Reminder[]> {
  const { data, error } = await db
    .from('reminders')
    .select('*')
    .eq('group_id', params.group_id)
    .eq('sender_wa_id', params.sender_wa_id)
    .is('sent_at', null)
    .gte('fire_at', new Date().toISOString())
    .order('fire_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('[ReminderStore] Failed to fetch pending reminders:', error);
    return [];
  }
  return (data ?? []) as Reminder[];
}

/**
 * Cancel (delete) the first reminder that matches the given text fragment.
 * Returns the reminder text that was cancelled, or null if nothing matched.
 */
export async function cancelReminder(params: { group_id: string; sender_wa_id: string; textFragment: string }): Promise<string | null> {
  const { data: pending } = await db
    .from('reminders')
    .select('id, reminder_text')
    .eq('group_id', params.group_id)
    .eq('sender_wa_id', params.sender_wa_id)
    .is('sent_at', null)
    .gte('fire_at', new Date().toISOString());

  const match = (pending ?? []).find((r: { id: string; reminder_text: string }) => r.reminder_text.toLowerCase().includes(params.textFragment.toLowerCase()));

  if (!match) return null;

  await db.from('reminders').delete().eq('id', match.id);
  return match.reminder_text as string;
}
