#!/usr/bin/env node
/**
 * UserPromptSubmit hook — Detect user corrections and save them.
 *
 * Reads user prompt from stdin, matches against correction patterns,
 * and appends any detected corrections to .claudemd-lint/corrections.json.
 */

import { readStdin, extractPrompt, createHookOutput, getStorageDir } from './lib/stdin.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

// --- Inline correction patterns (simplified for hook performance) ---

const PATTERNS = [
  // Replacement patterns
  {
    id: 'use-instead',
    regex: /(?:no,?\s+)?use\s+(.+?)\s+instead\s+of\s+(.+)/i,
    category: 'style',
    confidence: 0.9,
    extract: (m) => `Use ${m[1].trim()} instead of ${m[2].trim()}`,
  },
  {
    id: 'dont-use-use',
    regex: /don['']?t\s+use\s+(.+?),?\s+use\s+(.+)/i,
    category: 'style',
    confidence: 0.9,
    extract: (m) => `Use ${m[2].trim()} instead of ${m[1].trim()}`,
  },
  // Recall patterns
  {
    id: 'i-told-you',
    regex: /i\s+(?:told|asked)\s+you\s+to\s+(.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extract: (m) => m[1].trim(),
  },
  {
    id: 'i-already-said',
    regex: /i\s+(?:already|previously)\s+(?:said|mentioned|told\s+you)\s+(.+)/i,
    category: 'behavior',
    confidence: 0.8,
    extract: (m) => m[1].trim(),
  },
  {
    id: 'i-said',
    regex: /(?:^|\.\s+)i\s+said\s+(.+)/i,
    category: 'behavior',
    confidence: 0.75,
    extract: (m) => m[1].trim(),
  },
  {
    id: 'as-i-mentioned',
    regex: /as\s+i\s+mentioned,?\s*(.+)/i,
    category: 'behavior',
    confidence: 0.75,
    extract: (m) => m[1].trim(),
  },
  // Always/Never directives
  {
    id: 'always-use',
    regex: /always\s+(?:use|do|include|add|write|prefer)\s+(.+)/i,
    category: 'convention',
    confidence: 0.9,
    extract: (m) => `Always ${m[0].replace(/^always\s+/i, '')}`,
  },
  {
    id: 'never-use',
    regex: /never\s+(?:use|do|include|add|write)\s+(.+)/i,
    category: 'convention',
    confidence: 0.9,
    extract: (m) => `Never ${m[0].replace(/^never\s+/i, '')}`,
  },
  // Stop doing
  {
    id: 'stop-doing',
    regex: /stop\s+(?:using|doing|adding|writing|creating)\s+(.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extract: (m) => `Do not ${m[0].replace(/^stop\s+/i, '')}`,
  },
  // Wrongness
  {
    id: 'thats-wrong',
    regex: /that['']?s\s+(?:wrong|not\s+right|incorrect|not\s+correct)/i,
    category: 'general',
    confidence: 0.7,
    extract: (_m, full) => {
      const after = full.match(/that['']?s\s+(?:wrong|not\s+right|incorrect)[.,]?\s*([^.!?\n]+)/i);
      return after?.[1]?.trim() ?? null;
    },
  },
  {
    id: 'not-like-that',
    regex: /not\s+(?:like\s+that|that\s+way)[.,]?\s*(.+)?/i,
    category: 'general',
    confidence: 0.65,
    extract: (m) => m[1]?.trim() ?? null,
  },
  // Remember / from now on
  {
    id: 'remember-to',
    regex: /(?:please\s+)?remember\s+to\s+(?:always\s+)?(.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extract: (m) => m[1].trim(),
  },
  {
    id: 'from-now-on',
    regex: /from\s+now\s+on,?\s*(.+)/i,
    category: 'behavior',
    confidence: 0.9,
    extract: (m) => m[1].trim(),
  },
  {
    id: 'going-forward',
    regex: /going\s+forward,?\s*(.+)/i,
    category: 'behavior',
    confidence: 0.85,
    extract: (m) => m[1].trim(),
  },
  {
    id: 'dont-forget',
    regex: /don['']?t\s+forget\s+to\s+(.+)/i,
    category: 'behavior',
    confidence: 0.8,
    extract: (m) => m[1].trim(),
  },
  {
    id: 'make-sure',
    regex: /make\s+sure\s+(?:to\s+)?(?:always\s+)?(.+)/i,
    category: 'behavior',
    confidence: 0.75,
    extract: (m) => m[1].trim(),
  },
  // Repeated complaint
  {
    id: 'you-keep',
    regex: /you\s+(?:keep|always|keep\s+on)\s+(.+)/i,
    category: 'behavior',
    confidence: 0.8,
    extract: (m) => `Do not ${m[1].trim()}`,
  },
  // Preference
  {
    id: 'i-prefer',
    regex: /i\s+(?:prefer|want\s+you\s+to|would\s+like\s+you\s+to)\s+(.+)/i,
    category: 'style',
    confidence: 0.8,
    extract: (m) => m[1].trim(),
  },
  // Correct way
  {
    id: 'correct-way',
    regex: /the\s+(?:correct|right|proper)\s+way\s+(?:is|to)\s+(.+)/i,
    category: 'convention',
    confidence: 0.85,
    extract: (m) => m[1].trim(),
  },
  // Korean
  {
    id: 'ko-instead',
    regex: /(.+?)\s*대신\s+(.+?)\s*(?:사용|써|쓰)/i,
    category: 'style',
    confidence: 0.9,
    extract: (m) => `${m[2].trim()} 사용 (${m[1].trim()} 대신)`,
  },
  {
    id: 'ko-always',
    regex: /항상\s+(.+?)(?:\s*해|$)/i,
    category: 'convention',
    confidence: 0.9,
    extract: (m) => `항상 ${m[1].trim()}`,
  },
  {
    id: 'ko-never',
    regex: /절대\s+(.+?)\s*(?:하지\s*마|금지|않)/i,
    category: 'convention',
    confidence: 0.9,
    extract: (m) => `절대 ${m[1].trim()} 하지 않기`,
  },
];

// --- Storage helpers ---

function readCorrections(storageDir) {
  const filePath = join(storageDir, 'corrections.json');
  try {
    if (!existsSync(filePath)) return [];
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function appendCorrection(storageDir, correction) {
  if (!existsSync(storageDir)) {
    mkdirSync(storageDir, { recursive: true });
  }
  const corrections = readCorrections(storageDir);
  corrections.push(correction);
  writeFileSync(
    join(storageDir, 'corrections.json'),
    JSON.stringify(corrections, null, 2),
    'utf-8'
  );
}

// --- Main ---

async function main() {
  const raw = await readStdin();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(JSON.stringify(createHookOutput('UserPromptSubmit')));
    return;
  }

  const prompt = extractPrompt(raw);
  if (!prompt || prompt.length < 5) {
    console.log(JSON.stringify(createHookOutput('UserPromptSubmit')));
    return;
  }

  const cwd = parsed.cwd || parsed.directory || process.cwd();
  const sessionId = parsed.session_id || parsed.sessionId || 'unknown';
  const storageDir = getStorageDir(cwd);

  // Match against patterns
  let bestMatch = null;
  let bestConfidence = 0;

  for (const pattern of PATTERNS) {
    const match = prompt.match(pattern.regex);
    if (match && pattern.confidence > bestConfidence) {
      const rule = pattern.extract(match, prompt);
      if (rule && rule.length >= 5) {
        bestMatch = { pattern, match, rule };
        bestConfidence = pattern.confidence;
      }
    }
  }

  // Save correction if detected
  if (bestMatch) {
    const correction = {
      id: randomUUID(),
      timestamp: Date.now(),
      sessionId,
      pattern: bestMatch.pattern.id,
      originalMessage: prompt.slice(0, 500),
      extractedRule: bestMatch.rule,
      category: bestMatch.pattern.category,
      confidence: bestMatch.pattern.confidence,
    };

    appendCorrection(storageDir, correction);
  }

  console.log(JSON.stringify(createHookOutput('UserPromptSubmit')));
}

try {
  await main();
} catch {
  console.log(JSON.stringify({ continue: true }));
}
