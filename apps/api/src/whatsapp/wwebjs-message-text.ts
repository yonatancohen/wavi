/**
 * Enrich a wwebjs quoted/inbound message body so link-preview URLs are present
 * even when WhatsApp puts them outside the plain `.body` string.
 */
export function enrichWwebjsMessageBody(
  body: string | undefined | null,
  raw?: {
    links?: Array<{ link?: string } | string> | null;
    _data?: {
      canonicalUrl?: string | null;
      matchedText?: string | null;
      links?: Array<{ link?: string } | string> | null;
      deprecatedMms3Url?: string | null;
    } | null;
  } | null,
): string {
  const parts: string[] = [];
  const push = (v?: string | null) => {
    const t = v?.trim();
    if (!t || parts.includes(t)) return;
    parts.push(t);
  };

  push(body);
  push(raw?._data?.canonicalUrl);
  push(raw?._data?.matchedText);

  const linkLists = [raw?.links, raw?._data?.links];
  for (const list of linkLists) {
    if (!list) continue;
    for (const entry of list) {
      push(typeof entry === 'string' ? entry : entry.link);
    }
  }

  return parts.join('\n');
}
