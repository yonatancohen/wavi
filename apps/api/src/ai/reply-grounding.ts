import { nameAppearsInText, stripUnicodeDirectionMarks } from '../lib/identity.js';

const HE_INVOKE = /(?:תזרימ[יי]?|תזרים|תכניס[יי]?|תזמינ[יי]?|תזמין)\s+את\s+([^\s,?.!@]+)/gu;
const EN_INVOKE = /\bbring\s+(?:in\s+)?([A-Za-z][\w'-]+)(?:\s+in)?\b/gi;

/** Names the sender explicitly asked Wavi to involve ("תזרימי את אלון", "bring Alon in"). */
export function extractInvokedNames(message: string): string[] {
  const cleaned = stripUnicodeDirectionMarks(message);
  const names: string[] = [];
  const seen = new Set<string>();

  for (const re of [HE_INVOKE, EN_INVOKE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(cleaned)) !== null) {
      const name = match[1]?.trim();
      if (!name || name.length < 2) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }

  return names;
}

export type InvokedPersonRef = {
  display_name: string;
  aliases?: string[];
  invoked_as?: string;
};

/** True when at least one invoked person is missing from the reply (any name/alias). */
export function replyMissesInvokedPeople(reply: string, people: InvokedPersonRef[]): boolean {
  if (!people.length) return false;
  return people.some((person) => {
    const names = [person.display_name, ...(person.aliases ?? []), person.invoked_as].filter((name): name is string => Boolean(name && name.trim()));
    return !names.some((name) => nameAppearsInText(reply, name));
  });
}

export function invokedRewriteInstruction(people: InvokedPersonRef[], he = false): string {
  const labels = people.map((person) => person.invoked_as || person.display_name).join(', ');
  if (he) {
    return `התשובה הקודמת שלך לא שילבה את ${labels}, שביקשו שתערב. תענה שוב רק להודעה שתייגו. תקרא להם בשם ותכניס אותם לשיחה. בלי למשוך נושאים לא קשורים מהעבר.`;
  }
  return `Your last reply did not involve ${labels}, who you were asked to bring in. Reply again to the tagged message only. Name them and pull them into the conversation. Do not bring in unrelated past topics.`;
}
