// ============================================================
// claudemd-lint — Correction Pattern Definitions
// ============================================================

import type { CorrectionCategory } from '../types.js';

export interface CorrectionPattern {
  id: string;
  regex: RegExp;
  category: CorrectionCategory;
  confidence: number;
  extractRule: (match: RegExpMatchArray, fullText: string) => string;
}

/**
 * Extract the clause after a matched prefix, trimmed and cleaned.
 */
function afterMatch(match: RegExpMatchArray): string {
  const full = match[0];
  const idx = match.index ?? 0;
  const input = match.input ?? '';
  const rest = input.slice(idx + full.length).trim();
  // Take first sentence or up to 200 chars
  const sentence = rest.match(/^[^.!?\n]+/)?.[0] ?? rest.slice(0, 200);
  return sentence.trim();
}

/**
 * Use named capture groups where available, fall back to afterMatch.
 */
function fromGroups(match: RegExpMatchArray, key: string): string {
  return match.groups?.[key]?.trim() ?? afterMatch(match);
}

export const CORRECTION_PATTERNS: CorrectionPattern[] = [
  // --- Replacement patterns ---
  {
    id: 'use-instead',
    regex: /(?:no,?\s+)?use\s+(?<preferred>.+?)\s+instead\s+of\s+(?<rejected>.+)/i,
    category: 'style',
    confidence: 0.9,
    extractRule: (m) =>
      `Use ${fromGroups(m, 'preferred')} instead of ${fromGroups(m, 'rejected')}`,
  },
  {
    id: 'dont-use-use',
    regex: /don['']?t\s+use\s+(?<rejected>.+?),?\s+use\s+(?<preferred>.+)/i,
    category: 'style',
    confidence: 0.9,
    extractRule: (m) =>
      `Use ${fromGroups(m, 'preferred')} instead of ${fromGroups(m, 'rejected')}`,
  },

  // --- Reminder / recall patterns ---
  {
    id: 'i-told-you',
    regex: /i\s+(?:told|asked)\s+you\s+to\s+(?<instruction>.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extractRule: (m) => fromGroups(m, 'instruction'),
  },
  {
    id: 'i-already-said',
    regex: /i\s+(?:already|previously)\s+(?:said|mentioned|told\s+you)\s+(?<instruction>.+)/i,
    category: 'behavior',
    confidence: 0.8,
    extractRule: (m) => fromGroups(m, 'instruction'),
  },
  {
    id: 'i-said',
    regex: /(?:^|\.\s+)i\s+said\s+(?<instruction>.+)/i,
    category: 'behavior',
    confidence: 0.75,
    extractRule: (m) => fromGroups(m, 'instruction'),
  },
  {
    id: 'as-i-mentioned',
    regex: /as\s+i\s+mentioned,?\s*(?<instruction>.+)/i,
    category: 'behavior',
    confidence: 0.75,
    extractRule: (m) => fromGroups(m, 'instruction'),
  },

  // --- Always / Never directives ---
  {
    id: 'always-use',
    regex: /always\s+(?:use|do|include|add|write|prefer)\s+(?<rule>.+)/i,
    category: 'convention',
    confidence: 0.9,
    extractRule: (m) => `Always ${m[0].replace(/^always\s+/i, '')}`,
  },
  {
    id: 'never-use',
    regex: /never\s+(?:use|do|include|add|write)\s+(?<rule>.+)/i,
    category: 'convention',
    confidence: 0.9,
    extractRule: (m) => `Never ${m[0].replace(/^never\s+/i, '')}`,
  },

  // --- Stop doing X ---
  {
    id: 'stop-doing',
    regex: /stop\s+(?:using|doing|adding|writing|creating)\s+(?<thing>.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extractRule: (m) => `Do not ${m[0].replace(/^stop\s+/i, '')}`,
  },

  // --- Wrongness indicators ---
  {
    id: 'thats-wrong',
    regex: /that['']?s\s+(?:wrong|not\s+right|incorrect|not\s+correct|not\s+what\s+i)/i,
    category: 'general',
    confidence: 0.7,
    extractRule: (_m, full) => {
      // Try to get the next sentence as context
      const afterWrong = full.match(
        /that['']?s\s+(?:wrong|not\s+right|incorrect)[.,]?\s*(?<ctx>[^.!?\n]+)/i
      );
      return afterWrong?.groups?.ctx?.trim() ?? 'Correction detected (review context)';
    },
  },
  {
    id: 'not-like-that',
    regex: /not\s+(?:like\s+that|that\s+way)[.,]?\s*(?<instruction>.+)?/i,
    category: 'general',
    confidence: 0.65,
    extractRule: (m) =>
      m.groups?.instruction?.trim() ?? 'Correction detected (review context)',
  },

  // --- Remember / From now on ---
  {
    id: 'remember-to',
    regex: /(?:please\s+)?remember\s+to\s+(?:always\s+)?(?<rule>.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extractRule: (m) => fromGroups(m, 'rule'),
  },
  {
    id: 'from-now-on',
    regex: /from\s+now\s+on,?\s*(?<rule>.+)/i,
    category: 'behavior',
    confidence: 0.9,
    extractRule: (m) => fromGroups(m, 'rule'),
  },
  {
    id: 'going-forward',
    regex: /going\s+forward,?\s*(?<rule>.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extractRule: (m) => fromGroups(m, 'rule'),
  },
  {
    id: 'dont-forget',
    regex: /don['']?t\s+forget\s+to\s+(?<rule>.+)/i,
    category: 'behavior',
    confidence: 0.8,
    extractRule: (m) => fromGroups(m, 'rule'),
  },
  {
    id: 'make-sure',
    regex: /make\s+sure\s+(?:to\s+)?(?:always\s+)?(?<rule>.+)/i,
    category: 'behavior',
    confidence: 0.75,
    extractRule: (m) => fromGroups(m, 'rule'),
  },

  // --- Repeated complaint ---
  {
    id: 'you-keep',
    regex: /you\s+(?:keep|always|keep\s+on)\s+(?<complaint>.+)/i,
    category: 'behavior',
    confidence: 0.8,
    extractRule: (m) => {
      const complaint = fromGroups(m, 'complaint');
      return `Do not ${complaint}`;
    },
  },

  // --- Preference ---
  {
    id: 'i-prefer',
    regex: /i\s+(?:prefer|want\s+you\s+to|would\s+like\s+you\s+to)\s+(?<pref>.+)/i,
    category: 'style',
    confidence: 0.8,
    extractRule: (m) => fromGroups(m, 'pref'),
  },

  // --- Correct way ---
  {
    id: 'correct-way',
    regex: /the\s+(?:correct|right|proper)\s+way\s+(?:is|to)\s+(?<rule>.+)/i,
    category: 'convention',
    confidence: 0.85,
    extractRule: (m) => fromGroups(m, 'rule'),
  },

  // --- Korean equivalents ---
  {
    id: 'ko-instead',
    regex: /(?<rejected>.+?)\s*대신\s+(?<preferred>.+?)\s*(?:사용|써|쓰)/i,
    category: 'style',
    confidence: 0.9,
    extractRule: (m) =>
      `${fromGroups(m, 'preferred')} 사용 (${fromGroups(m, 'rejected')} 대신)`,
  },
  {
    id: 'ko-always',
    regex: /항상\s+(?<rule>.+?)(?:\s*해|$)/i,
    category: 'convention',
    confidence: 0.9,
    extractRule: (m) => `항상 ${fromGroups(m, 'rule')}`,
  },
  {
    id: 'ko-never',
    regex: /절대\s+(?<rule>.+?)\s*(?:하지\s*마|금지|않)/i,
    category: 'convention',
    confidence: 0.9,
    extractRule: (m) => `절대 ${fromGroups(m, 'rule')} 하지 않기`,
  },
  {
    id: 'ko-stop',
    regex: /(?<thing>.+?)\s*(?:그만|멈춰|중단)/i,
    category: 'behavior',
    confidence: 0.7,
    extractRule: (m) => `${fromGroups(m, 'thing')} 중단`,
  },
];

/**
 * Match a user message against all correction patterns.
 * Returns all matches sorted by confidence (highest first).
 */
export function detectCorrections(
  text: string
): Array<{ pattern: CorrectionPattern; match: RegExpMatchArray; rule: string }> {
  const results: Array<{
    pattern: CorrectionPattern;
    match: RegExpMatchArray;
    rule: string;
  }> = [];

  for (const pattern of CORRECTION_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const rule = pattern.extractRule(match, text);
      if (rule && rule !== 'Correction detected (review context)') {
        results.push({ pattern, match, rule });
      }
    }
  }

  return results.sort((a, b) => b.pattern.confidence - a.pattern.confidence);
}
