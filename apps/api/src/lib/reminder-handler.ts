// Core reminder command logic, shared between the WhatsApp message handler
// and the test-chat endpoint. Returns a reply string without sending it so
// either caller can deliver via its own channel.

import { createReminder, getPendingReminders, cancelReminder, deleteReminderById } from './reminder-store.js';
import { parseReminderInput, formatFireTime } from './time-parser.js';

const GROUP_TIMEZONE = process.env.GROUP_TIMEZONE ?? 'Asia/Jerusalem';

// ── Command detection ─────────────────────────────────────────

type ReminderSubcmd = 'create' | 'list' | 'cancel';

interface ReminderCommand {
  sub: ReminderSubcmd;
  payload: string;
}

export function detectReminderCommand(body: string): ReminderCommand | null {
  const stripped = body.replace(/@\S+/g, '').trim();

  if (/^(?:my\s+reminders?|what(?:'s|\s+are)?\s+my\s+reminders?|list\s+reminders?|show\s+reminders?)/i.test(stripped) || /^(?:התזכורות\s+שלי|מה\s+התזכורות|הראה\s+תזכורות)/.test(stripped)) {
    return { sub: 'list', payload: '' };
  }

  const cancelEnMatch = stripped.match(/^(?:cancel|delete|remove)\s+reminder[:\s]+(.+)/i);
  if (cancelEnMatch) return { sub: 'cancel', payload: cancelEnMatch[1].trim() };

  const cancelHeMatch = stripped.match(/^(?:בטל|מחק)\s+תזכורת[:\s]*(.+)/);
  if (cancelHeMatch) return { sub: 'cancel', payload: cancelHeMatch[1].trim() };

  const createEnMatch = stripped.match(/^(?:remind\s+(?:me|us)|\/reminder)[:\s]+(.+)/i);
  if (createEnMatch) return { sub: 'create', payload: createEnMatch[1].trim() };

  const createHeMatch = stripped.match(/^(?:תזכיר\s+לי|תזכיר\s+לנו|תזכור\s+לי|הזכר\s+לי|הזכירו\s+לי|\/reminder)[:\s]*(.+)/);
  if (createHeMatch) return { sub: 'create', payload: createHeMatch[1].trim() };

  return null;
}

// ── Absolute time formatter (for list output) ─────────────────

export function formatAbsoluteTime(fireAt: Date, isHebrew: boolean): string {
  return fireAt.toLocaleString(isHebrew ? 'he-IL' : 'en-US', {
    timeZone: GROUP_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ── Core resolution ───────────────────────────────────────────

export interface ReminderResult {
  handled: boolean;
  reply: string;
}

/**
 * Detect and execute a reminder command contained in `body`.
 * Returns `{ handled: true, reply }` when a reminder command was found so the
 * caller can deliver the reply via its own channel (WhatsApp send or test-chat
 * HTTP response). Returns `{ handled: false, reply: '' }` otherwise.
 */
export async function resolveReminderCommand(params: { groupId: string; waGroupId: string; senderWaId: string; senderName: string; body: string }): Promise<ReminderResult> {
  const cmd = detectReminderCommand(params.body);
  if (!cmd) return { handled: false, reply: '' };

  const isHebrew = /[\u0590-\u05FF]/.test(params.body) || /[\u0590-\u05FF]/.test(params.senderName);

  // ── List ──────────────────────────────────────────────────────
  if (cmd.sub === 'list') {
    const pending = await getPendingReminders({
      group_id: params.groupId,
      sender_wa_id: params.senderWaId,
    });

    let reply: string;
    if (!pending.length) {
      reply = isHebrew ? 'אין לך תזכורות ממתינות 🙂' : "You don't have any pending reminders 🙂";
    } else {
      const lines = pending.map((r, i) => {
        const when = formatAbsoluteTime(new Date(r.fire_at), isHebrew);
        return `${i + 1}. ${r.reminder_text} — ${when}`;
      });
      reply = isHebrew ? `התזכורות שלך:\n${lines.join('\n')}` : `Your reminders:\n${lines.join('\n')}`;
    }
    return { handled: true, reply };
  }

  // ── Cancel ────────────────────────────────────────────────────
  if (cmd.sub === 'cancel') {
    const cancelled = await cancelReminder({
      group_id: params.groupId,
      sender_wa_id: params.senderWaId,
      textFragment: cmd.payload,
    });

    const reply = cancelled ? (isHebrew ? `בוטלה תזכורת: "${cancelled}" ✅` : `Cancelled reminder: "${cancelled}" ✅`) : isHebrew ? `לא מצאתי תזכורת כזו 😕` : `Couldn't find that reminder 😕`;

    return { handled: true, reply };
  }

  // ── Create ────────────────────────────────────────────────────
  const pending = await getPendingReminders({
    group_id: params.groupId,
    sender_wa_id: params.senderWaId,
  });

  let droppedText: string | null = null;
  if (pending.length >= 10) {
    const oldest = pending[0];
    await deleteReminderById(oldest.id);
    droppedText = oldest.reminder_text;
  }

  const parsed = parseReminderInput(cmd.payload);

  if (!parsed) {
    const reply = isHebrew
      ? `לא הצלחתי להבין את הזמן 😅 נסה משהו כמו "בעוד 10 דקות", "מחר ב-9", "בשעה 18:00"`
      : `Couldn't understand the time 😅 Try something like "in 10 minutes", "tomorrow at 9am", "at 18:00"`;
    return { handled: true, reply };
  }

  const saved = await createReminder({
    group_id: params.groupId,
    wa_group_id: params.waGroupId,
    sender_wa_id: params.senderWaId,
    sender_name: params.senderName,
    reminder_text: parsed.reminderText,
    fire_at: parsed.fireAt,
  });

  let reply: string;
  if (!saved) {
    reply = isHebrew ? 'משהו השתבש, נסה שוב 😅' : 'Something went wrong, please try again 😅';
  } else {
    const when = formatFireTime(parsed.fireAt, isHebrew);
    const text = parsed.reminderText;
    if (droppedText) {
      reply = isHebrew
        ? `⏰ סבבה! אזכיר לך "${text}" ${when}. (הסרתי את הישנה ביותר שלך — "${droppedText}" — כי הגעת לגבול)`
        : `⏰ Got it! I'll remind you "${text}" ${when}. (Dropped your oldest reminder — "${droppedText}" — to make room)`;
    } else {
      reply = isHebrew ? `⏰ סבבה! אזכיר לך "${text}" ${when}` : `⏰ Got it! I'll remind you "${text}" ${when}`;
    }
  }

  return { handled: true, reply };
}
