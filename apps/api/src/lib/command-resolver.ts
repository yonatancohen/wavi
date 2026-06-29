/**
 * Pure command resolver — detects and executes structured commands
 * (memory, alias, rotation, schedule, upcoming, help, summarize).
 *
 * Returns { handled: true, reply } when a command matched, or { handled: false }
 * when the message should go to the normal Claude reply path.
 *
 * Shared by the live WhatsApp handler and the dashboard test-reply route.
 * No WhatsApp delivery happens here — callers send the reply themselves.
 */

import { db } from '../db/client.js';
import type { LanguageMode, CharacterConfig } from '@wavi/shared';

const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';
const GROUP_TIMEZONE = process.env.GROUP_TIMEZONE ?? 'Asia/Jerusalem';

export interface CommandResult {
  handled: true;
  reply: string;
}

export interface CommandMiss {
  handled: false;
}

export type CommandOutcome = CommandResult | CommandMiss;

// ── Params shared by all resolvers ────────────────────────────

export interface CommandParams {
  groupId: string;
  senderWaId: string;
  senderName: string;
  body: string;
  languageMode: LanguageMode;
}

// ── Memory ────────────────────────────────────────────────────

type MemoryCommand = 'remember' | 'forget' | 'recall';

function detectMemoryCommand(body: string): { cmd: MemoryCommand; payload: string } | null {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();
  const rememberMatch = stripped.match(/^(?:remember|זכור|תזכור)[:\s]+(.+)/i);
  if (rememberMatch) return { cmd: 'remember', payload: rememberMatch[1].trim() };
  const forgetMatch = stripped.match(/^(?:forget|שכח|תשכח)[:\s]+(.+)/i);
  if (forgetMatch) return { cmd: 'forget', payload: forgetMatch[1].trim() };
  if (/^(?:what do you remember|מה אתה זוכר|מה את זוכרת)/i.test(stripped)) return { cmd: 'recall', payload: '' };
  return null;
}

export async function resolveMemoryCommand(params: CommandParams): Promise<CommandOutcome> {
  const parsed = detectMemoryCommand(params.body);
  if (!parsed) return { handled: false };

  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);
  let reply: string;

  if (parsed.cmd === 'remember') {
    await db.from('group_memories').insert({ group_id: params.groupId, memory_text: parsed.payload, added_by_wa_id: params.senderWaId, added_by_name: params.senderName });
    reply = he ? 'סבבה, אזכור 👍' : "Got it, I'll remember that 👍";
  } else if (parsed.cmd === 'forget') {
    const { data: memories } = await db.from('group_memories').select('id, memory_text').eq('group_id', params.groupId);
    const memList = memories ?? [];
    let match = memList.find((m) => m.memory_text.toLowerCase().includes(parsed.payload.toLowerCase()));

    if (!match && memList.length > 0) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const haystack = memList.map((m, i) => `${i}: ${m.memory_text}`).join('\n');
        const resp = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 10,
          messages: [{ role: 'user', content: `Which memory best matches: "${parsed.payload}"\n${haystack}\nReturn ONLY the 0-based index number, or -1 if none match.` }],
        });
        const { recordAnthropicCall } = await import('./usage-record.js');
        await recordAnthropicCall({ type: 'synthesis', groupId: params.groupId, usage: resp.usage });
        const idx = parseInt(resp.content[0].type === 'text' ? resp.content[0].text.trim() : '-1');
        if (idx >= 0 && idx < memList.length) match = memList[idx];
      } catch {
        // fall through
      }
    }

    if (match) {
      await db.from('group_memories').delete().eq('id', match.id);
      reply = he ? 'שכחתי ✅' : 'Forgot it ✅';
    } else {
      reply = he ? 'לא מצאתי משהו כזה לשכוח' : "Couldn't find that to forget";
    }
  } else {
    const { data: memories } = await db.from('group_memories').select('memory_text').eq('group_id', params.groupId).order('created_at', { ascending: false }).limit(10);
    if (!memories?.length) {
      reply = he ? 'עדיין לא זכרתי כלום 😄' : "I haven't stored anything yet 😄";
    } else {
      const list = memories.map((m) => `• ${m.memory_text}`).join('\n');
      reply = he ? `זה מה שאני זוכר:\n${list}` : `Here's what I remember:\n${list}`;
    }
  }

  return { handled: true, reply };
}

// ── Rotation ──────────────────────────────────────────────────

type RotationCmd = { cmd: 'record'; item: string; personName: string } | { cmd: 'query_last'; item: string } | { cmd: 'query_next'; item: string };

function detectRotationCommand(body: string): RotationCmd | null {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();
  const heRecord = stripped.match(/^(?:רשום\s+ש)?(\S+)\s+(?:הביא|הביאה|הביאו)\s+(.+)$/);
  if (heRecord) return { cmd: 'record', personName: heRecord[1].trim(), item: heRecord[2].trim() };
  const enRecord = stripped.match(/^(\S+)\s+brought\s+(.+)$/i);
  if (enRecord) return { cmd: 'record', personName: enRecord[1].trim(), item: enRecord[2].trim() };
  const heLast = stripped.match(/^מי\s+הביא\s+(.+?)(?:\s+פעם\s+אחרונה)?[?？]?$/);
  if (heLast) return { cmd: 'query_last', item: heLast[1].trim() };
  const enLast = stripped.match(/^who(?:\s+last)?\s+brought\s+(.+?)[?？]?$/i);
  if (enLast) return { cmd: 'query_last', item: enLast[1].trim() };
  const heNext = stripped.match(/^מי\s+הב(?:א|אה)\s+בתור\s+(.+?)[?？]?$/);
  if (heNext) return { cmd: 'query_next', item: heNext[1].trim() };
  const enNext = stripped.match(/^whose\s+turn\s+(?:for|to bring)\s+(.+?)[?？]?$/i);
  if (enNext) return { cmd: 'query_next', item: enNext[1].trim() };
  return null;
}

export async function resolveRotationCommand(params: CommandParams): Promise<CommandOutcome> {
  const cmd = detectRotationCommand(params.body);
  if (!cmd) return { handled: false };

  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);
  const { recordRotation, getLastBrought, getRotationHistory } = await import('./rotation-tracker.js');

  if (cmd.cmd === 'record') {
    await recordRotation({ groupId: params.groupId, item: cmd.item, personWaId: params.senderWaId, personName: cmd.personName, addedByWaId: params.senderWaId });
    return { handled: true, reply: he ? `סבבה, רשמתי ש${cmd.personName} הביא ${cmd.item} 👍` : `Got it — recorded that ${cmd.personName} brought ${cmd.item} 👍` };
  }

  if (cmd.cmd === 'query_last') {
    const last = await getLastBrought(params.groupId, cmd.item);
    if (!last) return { handled: true, reply: he ? `אין לי רשומות על מי הביא ${cmd.item}` : `No records of who brought ${cmd.item}` };
    const when = new Date(last.brought_at).toLocaleDateString('he-IL');
    return { handled: true, reply: he ? `${last.person_name} הביא ${cmd.item} ב-${when}` : `${last.person_name} brought ${cmd.item} on ${when}` };
  }

  const history = await getRotationHistory(params.groupId, cmd.item, 10);
  if (!history.length)
    return { handled: true, reply: he ? `אין לי היסטוריה של ${cmd.item} — תרשמו מי מביא ואגיד מי הבא בתור` : `No history for ${cmd.item} yet — start recording and I'll track whose turn it is` };
  const lastPerson = history[0];
  return { handled: true, reply: he ? `${lastPerson.person_name} הביא ${cmd.item} פעם אחרונה — בתור למישהו אחר!` : `${lastPerson.person_name} brought ${cmd.item} last — someone else's turn!` };
}

// ── Schedule ──────────────────────────────────────────────────

export async function resolveScheduleCommand(params: CommandParams): Promise<CommandOutcome> {
  const { detectScheduleCommand, parseScheduleCommand } = await import('./schedule-parser.js');
  if (!detectScheduleCommand(params.body, AGENT_NAME)) return { handled: false };

  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);
  const parsed = parseScheduleCommand(params.body, AGENT_NAME);
  if (!parsed) {
    return {
      handled: true,
      reply: he ? `לא הצלחתי להבין את הזמן. דוגמה: "@wavi תקבע כל שישי ב-18:00 מפגש שישי"` : `Couldn't parse that schedule. Example: "@wavi schedule every friday at 6pm friday meetup"`,
    };
  }

  const { computeNextFireAt } = await import('./automation-schedule.js');
  const next_fire_at = computeNextFireAt('scheduled_post', parsed.config).toISOString();

  await db.from('group_automations').insert({ group_id: params.groupId, type: 'scheduled_post', label: parsed.config.template ?? null, enabled: true, config: parsed.config, next_fire_at });

  return { handled: true, reply: he ? `סבבה, קבעתי 📅 ${parsed.label}` : `Done, scheduled 📅 ${parsed.label}` };
}

// ── Upcoming ──────────────────────────────────────────────────

export async function resolveUpcomingCommand(params: CommandParams): Promise<CommandOutcome> {
  const { detectUpcomingCommand } = await import('./schedule-parser.js');
  if (!detectUpcomingCommand(params.body, AGENT_NAME)) return { handled: false };

  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);

  const { data: automations } = await db
    .from('group_automations')
    .select('type, config, next_fire_at, enabled')
    .eq('group_id', params.groupId)
    .eq('enabled', true)
    .not('next_fire_at', 'is', null)
    .order('next_fire_at', { ascending: true })
    .limit(5);

  if (!automations?.length) return { handled: true, reply: he ? 'אין דברים מתוכננים כרגע 📭' : 'Nothing scheduled right now 📭' };

  const lines = automations.map((a) => {
    const cfg = a.config as { template?: string; frequency?: string };
    const label = cfg.template ?? (a.type === 'daily_digest' ? (he ? 'סיכום יומי' : 'Daily digest') : he ? 'הודעה מתוזמנת' : 'Scheduled post');
    const when = a.next_fire_at ? new Date(a.next_fire_at as string).toLocaleString('he-IL', { timeZone: GROUP_TIMEZONE, weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '?';
    return `• ${label} — ${when}`;
  });

  return { handled: true, reply: he ? `הנה מה שמתוכנן:\n${lines.join('\n')}` : `Here's what's scheduled:\n${lines.join('\n')}` };
}

// ── Help ──────────────────────────────────────────────────────

function detectHelpCommand(body: string): boolean {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();
  return /^(?:עזרה|מה\s+אתה\s+יודע|מה\s+את\s+יודעת|מה\s+אתה\s+יכול|מה\s+את\s+יכולה|פקודות|help|commands|what\s+can\s+you\s+do)[\s?？]?$/i.test(stripped);
}

export function resolveHelpCommand(params: CommandParams): CommandOutcome {
  if (!detectHelpCommand(params.body)) return { handled: false };

  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);

  const reply = he
    ? `הנה מה שאני יודע לעשות 👇

*זיכרון*
• @wavi תזכור: [משהו] — שמירת מידע
• @wavi מה אתה זוכר? — כל הזיכרונות
• @wavi שכח: [משהו] — מחיקה חכמה

*תזכורות*
• @wavi תזכיר לי בעוד 10 דקות [מה]
• @wavi תזכיר לי מחר ב-9 [מה]
• @wavi תזכורות — רשימה

*לוח זמנים*
• @wavi תקבע כל שישי ב-18:00 מפגש שישי
• @wavi מה מתוכנן?

*מי הביא מה*
• @wavi דן הביא פיצה — רישום
• @wavi מי הביא פיצה? — שאילתה
• @wavi מי הבא בתור פיצה?

*בידור*
• @wavi תצחק על [שם] — רוסט
• @wavi תסכם — סיכום 50 הודעות אחרונות

*שאר*
• @wavi [כל שאלה] — אני עונה מההיסטוריה של הקבוצה`
    : `Here's what I can do 👇

*Memory*
• @wavi remember: [something]
• @wavi what do you remember?
• @wavi forget: [something]

*Reminders*
• @wavi remind me in 10 minutes [what]
• @wavi remind me tomorrow at 9am [what]

*Scheduling*
• @wavi schedule every friday at 6pm friday meetup
• @wavi what's scheduled?

*Rotation tracking*
• @wavi Dan brought pizza
• @wavi who brought pizza?
• @wavi whose turn for pizza?

*Fun*
• @wavi roast [name]
• @wavi summarize

*Everything else*
• @wavi [any question] — I answer from the group's history`;

  return { handled: true, reply };
}

// ── Summarize ─────────────────────────────────────────────────

function detectSummarizeCommand(body: string): boolean {
  const stripped = body.replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '').trim();
  return /^(?:summarize|summary|תסכם|סיכום|תן סיכום)$/i.test(stripped);
}

export async function resolveSummarizeCommand(params: CommandParams): Promise<CommandOutcome> {
  if (!detectSummarizeCommand(params.body)) return { handled: false };

  const he = params.languageMode === 'he' || /[\u0590-\u05FF]/.test(params.body);

  const { data: recentMsgs } = await db
    .from('messages')
    .select('sender_name, body, timestamp')
    .eq('group_id', params.groupId)
    .eq('is_agent_reply', false)
    .order('timestamp', { ascending: false })
    .limit(50);

  if (!recentMsgs?.length) return { handled: true, reply: he ? 'אין מספיק הודעות לסיכום עדיין' : 'Not enough messages to summarize yet' };

  const { data: groupRow } = await db.from('groups').select('character_config').eq('id', params.groupId).single();
  const voice = (groupRow?.character_config as CharacterConfig | null)?.voice ?? '';
  const content = recentMsgs
    .reverse()
    .map((m) => `${m.sender_name}: ${m.body}`)
    .join('\n');
  const langInstruction = he ? 'Reply in natural Israeli Hebrew (spoken register).' : 'Reply in English.';

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `${langInstruction}\nYou are a WhatsApp group member: ${voice || 'casual, friendly'}\nSummarize the last messages in 2-4 sentences in your own voice — casual, no bullet points.\n\n${content.slice(0, 3000)}`,
      },
    ],
  });

  const { recordAnthropicCall } = await import('./usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: params.groupId, usage: response.usage });

  const summary = response.content[0].type === 'text' ? response.content[0].text.trim() : he ? 'לא הצלחתי לסכם' : 'Could not summarize';
  return { handled: true, reply: summary };
}

// ── Main resolver ─────────────────────────────────────────────

export async function resolveGroupCommand(params: CommandParams): Promise<CommandOutcome> {
  const memory = await resolveMemoryCommand(params);
  if (memory.handled) return memory;

  const rotation = await resolveRotationCommand(params);
  if (rotation.handled) return rotation;

  const schedule = await resolveScheduleCommand(params);
  if (schedule.handled) return schedule;

  const upcoming = await resolveUpcomingCommand(params);
  if (upcoming.handled) return upcoming;

  const help = resolveHelpCommand(params);
  if (help.handled) return help;

  const summarize = await resolveSummarizeCommand(params);
  if (summarize.handled) return summarize;

  return { handled: false };
}
