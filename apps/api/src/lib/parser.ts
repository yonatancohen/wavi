import type { ParsedWAMessage } from '@wavi/shared';

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

const IOS_PATTERN = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+?):\s(.+)$/;
const ANDROID_PATTERN = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+-\s+(.+?):\s(.+)$/;

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

function parseLine(line: string): ParsedWAMessage | null {
  // Strip Unicode direction marks (common in Hebrew exports)
  const clean = line.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
  if (!clean) return null;

  const match = clean.match(IOS_PATTERN) ?? clean.match(ANDROID_PATTERN);
  if (!match) return null;

  const [, datePart, timePart, senderName, body] = match;

  const timestamp = parseDate(datePart, timePart);
  if (!timestamp) return null;

  const bodyClean = body.trim();

  return {
    timestamp,
    sender_name: senderName.trim(),
    body: bodyClean,
    is_system_message: isSystemMessage(bodyClean),
    is_media_omitted: isMediaOmitted(bodyClean),
  };
}

// ── Main parser ───────────────────────────────────────────────

export function parseWAExport(raw: string): ParsedWAMessage[] {
  const lines = raw.split('\n');
  const messages: ParsedWAMessage[] = [];
  let current: string | null = null;

  for (const line of lines) {
    // Check if this line starts a new message
    const stripped = line.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    const isNewMessage = IOS_PATTERN.test(stripped) || ANDROID_PATTERN.test(stripped);

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

export function formatChunkForEmbedding(messages: ParsedWAMessage[]): string {
  return messages
    .filter((m) => !m.is_system_message && !m.is_media_omitted)
    .map((m) => `${m.sender_name}: ${m.body}`)
    .join('\n');
}
