import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaudeMd, getAllRules } from '../parser/claudemd-parser.js';
import { readAnalytics, writeAnalytics } from './storage.js';

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

/**
 * Tokenize text into significant keywords (>3 chars, not stopwords).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/**
 * Load all known rules from CLAUDE.md files in the given directory.
 */
export function loadKnownRules(
  cwd: string
): Array<{ id: string; text: string; tokens: string[] }> {
  const results: Array<{ id: string; text: string; tokens: string[] }> = [];

  // Check for CLAUDE.md files at common locations
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];

  // Also check parent directories (up to 3 levels)
  let dir = cwd;
  for (let i = 0; i < 3; i++) {
    const parent = join(dir, '..');
    if (parent === dir) break;
    candidates.push(join(parent, 'CLAUDE.md'));
    dir = parent;
  }

  const seen = new Set<string>();

  for (const filePath of candidates) {
    if (!existsSync(filePath) || seen.has(filePath)) continue;
    seen.add(filePath);

    try {
      const content = readFileSync(filePath, 'utf-8');
      const doc = parseClaudeMd(filePath, content);
      const rules = getAllRules(doc);

      for (const rule of rules) {
        const tokens = tokenize(rule.text);
        if (tokens.length >= 2) {
          results.push({ id: rule.id, text: rule.text, tokens });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

/**
 * Find rule IDs referenced in the given text using fuzzy keyword matching.
 * A rule is considered referenced if >60% of its keywords appear in the text.
 */
export function findRuleReferences(
  text: string,
  knownRules: Array<{ id: string; text: string; tokens: string[] }>
): string[] {
  const textTokens = new Set(tokenize(text));
  const matched: string[] = [];

  for (const rule of knownRules) {
    if (rule.tokens.length === 0) continue;

    const overlap = rule.tokens.filter((t) => textTokens.has(t)).length;
    const ratio = overlap / rule.tokens.length;

    if (ratio >= 0.6) {
      matched.push(rule.id);
    }
  }

  return matched;
}

/**
 * Record a rule reference in analytics storage.
 */
export function recordReference(
  cwd: string,
  ruleId: string,
  sessionId: string,
  context: string
): void {
  const analytics = readAnalytics(cwd);

  const existing = analytics.rules[ruleId];
  const now = Date.now();

  if (existing) {
    existing.totalReferences += 1;
    existing.lastReferenced = now;
    if (!existing.sessionsReferenced.includes(sessionId)) {
      existing.sessionsReferenced.push(sessionId);
    }
  } else {
    analytics.rules[ruleId] = {
      ruleId,
      ruleText: context.slice(0, 200),
      totalReferences: 1,
      lastReferenced: now,
      sessionsReferenced: [sessionId],
    };
  }

  writeAnalytics(cwd, analytics);
}
