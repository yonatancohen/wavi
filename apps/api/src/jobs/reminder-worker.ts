import { getDueReminders, markReminderSent } from '../lib/reminder-store.js';

// Poll every 30 s — inexpensive Supabase read, only touches the partial index
// (fire_at) WHERE sent_at IS NULL so it stays fast even with a large table.
const POLL_INTERVAL_MS = 30_000;

export async function startReminderWorker() {
  console.log('[ReminderWorker] Starting...');

  while (true) {
    try {
      await firedue();
    } catch (err) {
      console.error('[ReminderWorker] Poll error:', err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function firedue() {
  const due = await getDueReminders();
  if (due.length === 0) return;

  console.log(`[ReminderWorker] Firing ${due.length} reminder(s)`);

  const { sendReply } = await import('../whatsapp/client.js');

  for (const reminder of due) {
    try {
      const isHebrew = /[\u0590-\u05FF]/.test(reminder.reminder_text);
      const name = reminder.sender_name || reminder.sender_wa_id;

      // Mention the sender by name so WhatsApp surfaces the notification;
      // native @mention of JID is not possible here without participant lookup.
      const msg = isHebrew ? `⏰ ${name}, תזכורת: ${reminder.reminder_text}` : `⏰ ${name}, reminder: ${reminder.reminder_text}`;

      await sendReply(reminder.wa_group_id, msg);
      await markReminderSent(reminder.id);

      console.log(`[ReminderWorker] Sent reminder ${reminder.id} for ${name}`);
    } catch (err) {
      // Leave sent_at null so the next poll retries.
      console.error(`[ReminderWorker] Failed to send reminder ${reminder.id}:`, err);
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
