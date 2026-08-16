/**
 * Pull readable text + URLs from Baileys message content shapes.
 * Link previews often put the URL in canonicalUrl/matchedText, not only `.text`.
 */

type BaileysMsgContent = {
  conversation?: string | null;
  extendedTextMessage?: {
    text?: string | null;
    matchedText?: string | null;
    canonicalUrl?: string | null;
    title?: string | null;
    description?: string | null;
  } | null;
  documentMessage?: {
    caption?: string | null;
    title?: string | null;
    fileName?: string | null;
    url?: string | null;
  } | null;
  documentWithCaptionMessage?: {
    message?: { documentMessage?: BaileysMsgContent['documentMessage'] } | null;
  } | null;
  imageMessage?: { caption?: string | null } | null;
  videoMessage?: { caption?: string | null } | null;
};

function pushUnique(parts: string[], value?: string | null) {
  const v = value?.trim();
  if (!v) return;
  if (parts.includes(v)) return;
  parts.push(v);
}

/** Flatten conversation / link-preview / document fields into one searchable body. */
export function textFromBaileysMessageContent(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const msg = content as BaileysMsgContent;
  const parts: string[] = [];

  pushUnique(parts, msg.conversation);

  const ext = msg.extendedTextMessage;
  if (ext) {
    pushUnique(parts, ext.text);
    pushUnique(parts, ext.matchedText);
    pushUnique(parts, ext.canonicalUrl);
    pushUnique(parts, ext.title);
    pushUnique(parts, ext.description);
  }

  const doc = msg.documentMessage ?? msg.documentWithCaptionMessage?.message?.documentMessage;
  if (doc) {
    pushUnique(parts, doc.caption);
    pushUnique(parts, doc.title);
    pushUnique(parts, doc.fileName);
    pushUnique(parts, doc.url);
  }

  pushUnique(parts, msg.imageMessage?.caption);
  pushUnique(parts, msg.videoMessage?.caption);

  return parts.join('\n');
}
