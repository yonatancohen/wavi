import type { ParsedWAMessage } from '@wavi/shared';
import { cleanMessageBody, resolveSenderIdentity, stripUnicodeDirectionMarks } from './identity.js';

// ── Format patterns ───────────────────────────────────────────
//
// iOS:     [DD/MM/YYYY, HH:MM:SS] Name: message
//          [12/03/2024, 14:32:11] Dan: hey
//
// Android: DD/MM/YYYY, HH:MM - Name: message
//          12/03/2024, 14:32 - Dan: hey
//
// Some locales swap MM/DD. We try DD/MM first, fallback to MM/DD.
// Hebrew names are RTL but the format is the same — handled natively.
//
// Sender/body split uses colon + horizontal whitespace only (not `\s`, which
// includes newlines). Multiline messages often end line 1 with a trailing colon
// before the continuation — e.g. "Name: setup:\nactual text".

const IOS_HEADER = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+?):[ \t](.*)$/;
const ANDROID_HEADER = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+-\s+(.+?):[ \t](.*)$/;

// System messages to skip
const SYSTEM_PATTERNS = [
  /Messages and calls are end-to-end encrypted/i,
  /created group/i,
  /added you/i,
  /left$/i,
  /removed$/i,
  /changed the subject/i,
  /changed this group/i,
  /changed the group/i,
  /security code changed/i,
  /joined using this group/i,
  /\+\d+ joined/,
  /^\u202a?\+?\d[\d\s\-()]+\u202c?\s+(left|was removed)/,
  // Hebrew system messages
  /יצר\/ה קבוצה/,
  /הוסיף\/ה אותך/,
  /עזב\/ה/,
];

// Media omission patterns
const MEDIA_PATTERNS = [
  /<Media omitted>/i,
  /<image omitted>/i,
  /<video omitted>/i,
  /<audio omitted>/i,
  /<document omitted>/i,
  /<sticker omitted>/i,
  /\u200eimage omitted/i,
  /\u200evideo omitted/i,
  /\u200eaudio omitted/i,
  /תמונה הושמטה/i, // Hebrew: image omitted
  /סרטון הושמט/i, // Hebrew: video omitted
];

function isSystemMessage(body: string): boolean {
  return SYSTEM_PATTERNS.some((p) => p.test(body));
}

function isMediaOmitted(body: string): boolean {
  return MEDIA_PATTERNS.some((p) => p.test(body));
}

function parseDate(datePart: string, timePart: string): Date | null {
  // Normalize separators
  const d = datePart.replace(/\./g, '/').replace(/-/g, '/');
  const parts = d.split('/');

  if (parts.length !== 3) return null;

  // Try DD/MM/YYYY first (most WhatsApp locales)
  const tryDMY = (): Date | null => {
    const [dd, mm, yyyy] = parts;
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    const t = timePart.replace(/\s*(AM|PM)/i, '').trim();
    const dt = new Date(`${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${t}`);
    return isNaN(dt.getTime()) ? null : dt;
  };

  // Fallback MM/DD/YYYY (US locale)
  const tryMDY = (): Date | null => {
    const [mm, dd, yyyy] = parts;
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    const t = timePart.replace(/\s*(AM|PM)/i, '').trim();
    const dt = new Date(`${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${t}`);
    return isNaN(dt.getTime()) ? null : dt;
  };

  return tryDMY() ?? tryMDY();
}

function splitFirstLine(text: string): { headerLine: string; continuation: string } {
  const newlineIdx = text.indexOf('\n');
  if (newlineIdx === -1) return { headerLine: text, continuation: '' };
  return {
    headerLine: text.slice(0, newlineIdx),
    continuation: text.slice(newlineIdx + 1),
  };
}

function joinMessageBody(firstLineBody: string, continuation: string): string {
  const head = firstLineBody.trim();
  const tail = continuation.trim();
  if (!tail) return head;
  if (!head) return tail;
  return `${head}\n${tail}`;
}

function parseLine(line: string): ParsedWAMessage | null {
  const clean = stripUnicodeDirectionMarks(line).trim();
  if (!clean) return null;

  const { headerLine, continuation } = splitFirstLine(clean);
  const match = headerLine.match(IOS_HEADER) ?? headerLine.match(ANDROID_HEADER);
  if (!match) return null;

  const [, datePart, timePart, senderName, firstLineBody] = match;

  const timestamp = parseDate(datePart, timePart);
  if (!timestamp) return null;

  const senderLabel = stripUnicodeDirectionMarks(senderName).trim();
  const bodyClean = cleanMessageBody(joinMessageBody(firstLineBody, continuation));
  const identity = resolveSenderIdentity(senderLabel);

  return {
    timestamp,
    sender_name: identity.display_name,
    sender_wa_id: identity.id_source === 'phone' ? identity.wa_user_id : undefined,
    body: bodyClean,
    is_system_message: isSystemMessage(bodyClean),
    is_media_omitted: isMediaOmitted(bodyClean),
  };
}

function isMessageHeaderLine(line: string): boolean {
  const stripped = stripUnicodeDirectionMarks(line).trim();
  return IOS_HEADER.test(stripped) || ANDROID_HEADER.test(stripped);
}

// ── Main parser ───────────────────────────────────────────────

export function parseWAExport(raw: string): ParsedWAMessage[] {
  const lines = raw.split('\n');
  const messages: ParsedWAMessage[] = [];
  let current: string | null = null;

  for (const line of lines) {
    const stripped = stripUnicodeDirectionMarks(line).trim();
    const isNewMessage = isMessageHeaderLine(line);

    if (isNewMessage) {
      // Flush previous accumulated message
      if (current !== null) {
        const parsed = parseLine(current);
        if (parsed) messages.push(parsed);
      }
      current = stripped;
    } else if (current !== null) {
      // Multi-line message — append to current
      current += '\n' + stripped;
    }
  }

  // Flush last message
  if (current !== null) {
    const parsed = parseLine(current);
    if (parsed) messages.push(parsed);
  }

  return messages;
}

// ── Chunk into windows of N with overlap ─────────────────────

export function chunkMessages(messages: ParsedWAMessage[], windowSize = 50, overlap = 25): ParsedWAMessage[][] {
  const chunks: ParsedWAMessage[][] = [];

  for (let i = 0; i < messages.length; i += windowSize - overlap) {
    const chunk = messages.slice(i, i + windowSize);
    if (chunk.length < 10) break; // skip tiny trailing chunks
    chunks.push(chunk);
  }

  return chunks;
}

// ── Format chunk for embedding ────────────────────────────────

function shortDate(d: Date): string {
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format a chunk for storage + embedding.
 * Prepends a date-range header so Claude can answer temporal questions
 * ("when was the last time we went to Eilat?") from the chunk text alone.
 */
export function formatChunkForEmbedding(messages: ParsedWAMessage[]): string {
  const real = messages.filter((m) => !m.is_system_message && !m.is_media_omitted);
  if (real.length === 0) return '';

  const from = real[0]?.timestamp;
  const to = real[real.length - 1]?.timestamp;

  let header = '';
  if (from) {
    const fromStr = shortDate(from);
    const toStr = to ? shortDate(to) : '';
    header = !toStr || fromStr === toStr ? `[${fromStr}]\n` : `[${fromStr} – ${toStr}]\n`;
  }

  return header + real.map((m) => `${m.sender_name}: ${m.body}`).join('\n');
}
