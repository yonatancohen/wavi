export type ParsedImageReply = {
  imagePrompt: string;
  caption: string;
};

const IMAGE_REPLY_RE = /^IMAGE_PROMPT:\s*(.+?)(?:\r?\nCAPTION:\s*(.*))?$/s;

/** Parse Claude's structured image reply. Returns null for normal text replies. */
export function parseImageReply(raw: string): ParsedImageReply | null {
  const trimmed = raw.trim();
  const match = IMAGE_REPLY_RE.exec(trimmed);
  if (!match) return null;

  const imagePrompt = match[1]?.trim();
  if (!imagePrompt) return null;

  return {
    imagePrompt,
    caption: match[2]?.trim() ?? '',
  };
}

/** Format stored message body when an image was sent. */
export function formatImageMessageBody(caption: string, imagePrompt: string): string {
  if (caption) return caption;
  return `[image: ${imagePrompt.slice(0, 120)}${imagePrompt.length > 120 ? '…' : ''}]`;
}
