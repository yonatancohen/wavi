import type { LanguageMode } from '@wavi/shared';

export const MAX_TAGGED_MESSAGE_LENGTH = 800;

export type GuardResult = { blocked: false } | { blocked: true; deflection: string };

const CODE_BLOCK = /```[\s\S]*?```|`[^`]{20,}`/;
const JAILBREAK = /(?:ignore (?:all )?(?:previous|prior) instructions|show (?:me )?(?:your )?system prompt|act as (?:a )?(?:developer|admin)|you are now|DAN mode|jailbreak)/i;
const TASK_DUMP_HE = /(?:כתוב|בנה|תכתוב|תבנה).{0,30}(?:קוד|אפליקציה|סקריפט|מסמך|מאמר|תרגום|רשימה של \d+)/i;
const TASK_DUMP_EN = /(?:write|build|create|generate|debug|implement).{0,30}(?:code|app|application|script|essay|document|function|class|api|full (?:stack|project))/i;
const FENCED_ABUSE = /(?:^|\n)\s*(?:function|class|import |const |let |def |#include|public static)/m;

function isHebrewPreferred(languageMode: LanguageMode, body: string): boolean {
  if (languageMode === 'he') return true;
  if (languageMode === 'en') return false;
  return /[\u0590-\u05FF]/.test(body);
}

function deflection(languageMode: LanguageMode, body: string, kind: 'length' | 'scope' | 'abuse'): string {
  const he = isHebrewPreferred(languageMode, body);
  if (kind === 'length') {
    return he ? 'וואי זה ארוך מדי בשבילי 😅 תקצר ונדבר.' : "Whoa that's way too long for a group chat 😅 shorten it and try again.";
  }
  if (kind === 'scope') {
    return he ? 'אני סתם חבר בקבוצה, לא צוות הפיתוח שלך 😄 תשאל משהו קצר.' : "I'm just a group member, not your dev team 😄 ask me something quick.";
  }
  return he ? 'לא, תודה 😄 בוא נדבר כמו בני אדם.' : "Nah 😄 let's keep it casual.";
}

/** Cheap pre-LLM guard — conservative heuristics to skip Claude on obvious abuse. */
export function checkInputGuard(body: string, languageMode: LanguageMode): GuardResult {
  const trimmed = body.trim();
  if (trimmed.length > MAX_TAGGED_MESSAGE_LENGTH) {
    return { blocked: true, deflection: deflection(languageMode, body, 'length') };
  }

  if (CODE_BLOCK.test(trimmed) || FENCED_ABUSE.test(trimmed)) {
    return { blocked: true, deflection: deflection(languageMode, body, 'scope') };
  }

  if (JAILBREAK.test(trimmed)) {
    return { blocked: true, deflection: deflection(languageMode, body, 'abuse') };
  }

  if (TASK_DUMP_HE.test(trimmed) || TASK_DUMP_EN.test(trimmed)) {
    return { blocked: true, deflection: deflection(languageMode, body, 'scope') };
  }

  return { blocked: false };
}
