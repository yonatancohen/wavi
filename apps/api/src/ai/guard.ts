import type { LanguageMode } from '@wavi/shared';

export const MAX_TAGGED_MESSAGE_LENGTH = 800;

export type GuardResult = { blocked: false } | { blocked: true; deflection: string };

const CODE_BLOCK = /```[\s\S]*?```|`[^`]{20,}`/;
// "you are now" removed — too broad, fires on casual compliments like "you are now my coach"
const JAILBREAK = /(?:ignore (?:all )?(?:previous|prior) instructions|show (?:me )?(?:your )?system prompt|act as (?:a )?(?:developer|admin)|DAN mode|jailbreak)/i;
// תרגום (translation) removed — translation requests are legitimate group chat asks.
// מאמר (essay/article) removed — asking for a short article about a topic is in-scope.
const TASK_DUMP_HE = /(?:כתוב|בנה|תכתוב|תבנה).{0,30}(?:קוד|אפליקציה|סקריפט|רשימה של \d+)/i;
// class/document/essay removed — class is a fitness term, document/essay are legitimate.
const TASK_DUMP_EN = /(?:write|build|create|generate|debug|implement).{0,30}(?:code|script|function\s+(?:that|to|for|which)|api\s+(?:that|to|for)|full (?:stack|project))/i;
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
    return he ? 'קוד ואפליקציות זה לא בשבילי 😄 תשאל משהו אחר.' : "Coding and dev work isn't my thing 😄 ask me something else.";
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
