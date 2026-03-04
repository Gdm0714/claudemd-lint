#!/usr/bin/env node
/**
 * PostToolUse hook: detect rule references in tool output and update analytics.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readStdin } from './lib/stdin.mjs';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
  'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
  'did', 'let', 'put', 'say', 'she', 'too', 'use', 'that', 'this', 'with',
  'have', 'from', 'they', 'will', 'been', 'when', 'were', 'into', 'than',
  'more', 'also', 'some', 'what', 'each', 'make', 'like', 'time', 'just',
  'know', 'take', 'even', 'back', 'then', 'come', 'only', 'look', 'over',
  'such', 'give', 'most', 'very', 'after', 'before', 'should', 'could',
  'would', 'their', 'there', 'these', 'other', 'about', 'which', 'those',
  'being', 'where', 'while', 'through', 'during', 'always', 'never',
]);

// Tools whose output we want to analyze
const TRACKED_TOOLS = new Set(['Edit', 'Write', 'Bash']);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/**
 * Extract bullet/numbered rules from CLAUDE.md content.
 */
function extractRules(content) {
  const rules = [];
  const lines = content.split('\n');

  // Simple SHA-256-like hash (djb2) for rule IDs in pure JS
  function hashStr(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
      hash = hash >>> 0; // keep unsigned
    }
    return hash.toString(16).padStart(8, '0');
  }

  for (const line of lines) {
    // Bullet points
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[2].trim();
      if (text.length > 10) {
        rules.push({ id: hashStr(text), text, tokens: tokenize(text) });
      }
      continue;
    }

    // Numbered lists
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numberedMatch) {
      const text = numberedMatch[1].trim();
      if (text.length > 10) {
        rules.push({ id: hashStr(text), text, tokens: tokenize(text) });
      }
      continue;
    }
  }

  return rules;
}

/**
 * Load known rules from CLAUDE.md files.
 */
function loadKnownRules(cwd) {
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];

  // Check parent directories (up to 3 levels)
  let dir = cwd;
  for (let i = 0; i < 3; i++) {
    const parent = join(dir, '..');
    if (parent === dir) break;
    candidates.push(join(parent, 'CLAUDE.md'));
    dir = parent;
  }

  const seen = new Set();
  const rules = [];

  for (const filePath of candidates) {
    if (!existsSync(filePath) || seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      rules.push(...extractRules(content));
    } catch {
      // Skip unreadable files
    }
  }

  return rules;
}

/**
 * Find rule references in text using fuzzy keyword matching (>60% overlap).
 */
function findRuleReferences(text, knownRules) {
  const textTokens = new Set(tokenize(text));
  const matched = [];

  for (const rule of knownRules) {
    if (rule.tokens.length === 0) continue;
    const overlap = rule.tokens.filter((t) => textTokens.has(t)).length;
    const ratio = overlap / rule.tokens.length;
    if (ratio >= 0.6) {
      matched.push(rule);
    }
  }

  return matched;
}

/**
 * Read analytics.json from storage.
 */
function readAnalytics(cwd) {
  const filePath = join(cwd, '.claudemd-lint', 'analytics.json');
  if (!existsSync(filePath)) {
    return { rules: {}, sessions: [], totalSessions: 0 };
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return { rules: {}, sessions: [], totalSessions: 0 };
  }
}

/**
 * Write analytics.json to storage.
 */
function writeAnalytics(cwd, analytics) {
  const dir = join(cwd, '.claudemd-lint');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, 'analytics.json'), JSON.stringify(analytics, null, 2), 'utf-8');
}

async function main() {
  let input = '';
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || data.toolName || '';
    const toolOutput = data.tool_response || data.toolOutput || '';
    const cwd = data.cwd || process.cwd();
    const sessionId = data.session_id || data.sessionId || 'unknown';

    // Only process for tracked tools
    if (!TRACKED_TOOLS.has(toolName)) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    if (!toolOutput || typeof toolOutput !== 'string' || toolOutput.length < 20) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const knownRules = loadKnownRules(cwd);
    if (knownRules.length === 0) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const matchedRules = findRuleReferences(toolOutput, knownRules);

    if (matchedRules.length > 0) {
      const analytics = readAnalytics(cwd);
      const now = Date.now();

      for (const rule of matchedRules) {
        const existing = analytics.rules[rule.id];
        if (existing) {
          existing.totalReferences += 1;
          existing.lastReferenced = now;
          if (!existing.sessionsReferenced.includes(sessionId)) {
            existing.sessionsReferenced.push(sessionId);
          }
        } else {
          analytics.rules[rule.id] = {
            ruleId: rule.id,
            ruleText: rule.text.slice(0, 200),
            totalReferences: 1,
            lastReferenced: now,
            sessionsReferenced: [sessionId],
          };
        }
      }

      writeAnalytics(cwd, analytics);
    }
  } catch {
    // Graceful failure — always continue
  }

  console.log(JSON.stringify({ continue: true }));
}

try {
  await main();
} catch {
  console.log(JSON.stringify({ continue: true }));
}
