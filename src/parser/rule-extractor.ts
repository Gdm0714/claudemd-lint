import type { ClaudeMdDocument, ClaudeMdRule } from '../types.js';
import { getAllRules } from './claudemd-parser.js';

const CATEGORY_KEYWORDS: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['build', 'run', 'compile', 'install', 'npm', 'yarn', 'pip', 'gradle', 'cargo', 'docker', 'webpack', 'vite', '빌드', '실행', '컴파일', '설치'], category: 'Build & Run' },
  { keywords: ['test', 'spec', 'coverage', 'jest', 'vitest', 'pytest', 'junit', '테스트', '검증', '커버리지'], category: 'Testing' },
  { keywords: ['style', 'format', 'lint', 'prettier', 'eslint', 'naming', 'indent', 'quote', 'semicolon', '스타일', '네이밍', '포맷', '린트', '들여쓰기'], category: 'Code Style' },
  { keywords: ['git', 'commit', 'branch', 'merge', 'push', 'rebase', '커밋', '브랜치', '병합'], category: 'Version Control' },
  { keywords: ['deploy', 'ci', 'cd', 'pipeline', 'staging', 'production', 'release', '배포', '스테이징', '프로덕션', '릴리스'], category: 'Deployment' },
  { keywords: ['never', 'always', 'must', 'should', 'avoid', 'prefer', 'ensure', 'require', 'forbidden', 'prohibited', '금지', '반드시', '필수', '절대'], category: 'Conventions' },
];

/**
 * Normalize rule text: lowercase, remove punctuation, split compounds, collapse whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    // Split camelCase/PascalCase: "camelCase" → "camel Case" → "camel case"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Split concatenated words: "filenames" → keep as-is but also handled by stopwords
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very',
  'just', 'about', 'up', 'out', 'that', 'this', 'it', 'its',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'also',
  'use', 'using', 'always', 'never', 'make', 'sure',
]);

/**
 * Simple plural stemming: remove trailing 's' from words > 4 chars.
 */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

// Common short words that form compounds (e.g., "filename" = "file"+"name")
const COMPOUND_PARTS = ['file', 'name', 'type', 'case', 'code', 'path', 'line', 'test', 'time', 'base'];

/**
 * Expand a word into its parts if it's a compound of known short words.
 * E.g., "filename" → ["file", "name"], "codebase" → ["code", "base"]
 */
function expandCompound(word: string): string[] {
  if (word.length <= 6) return [word];
  for (const part of COMPOUND_PARTS) {
    if (word.startsWith(part) && word.length > part.length) {
      const rest = word.slice(part.length);
      if (rest.length >= 3) {
        return [part, stem(rest)];
      }
    }
    if (word.endsWith(part) && word.length > part.length) {
      const prefix = word.slice(0, word.length - part.length);
      if (prefix.length >= 3) {
        return [stem(prefix), part];
      }
    }
  }
  return [word];
}

/**
 * Tokenize normalized text into word array, filtering stopwords and short tokens.
 * Applies stemming and compound word expansion for better duplicate matching.
 */
export function tokenize(text: string): string[] {
  const raw = normalizeText(text)
    .split(' ')
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  const result: string[] = [];
  for (const word of raw) {
    const stemmed = stem(word);
    const parts = expandCompound(stemmed);
    result.push(...parts);
  }

  return [...new Set(result)]; // Deduplicate tokens
}

/**
 * Categorize a rule by keyword matching against its original text.
 * Uses regex word boundaries for ASCII keywords (avoids stop-word stripping issues).
 * Uses simple includes() for non-ASCII keywords (Korean etc.) since \b doesn't work with Unicode.
 */
export function categorizeRule(rule: ClaudeMdRule): string {
  const text = rule.text.toLowerCase();
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => {
      // ASCII-only keywords: use word boundary regex
      if (/^[a-z]+$/i.test(kw)) {
        return new RegExp(`\\b${kw}\\b`, 'i').test(text);
      }
      // Non-ASCII keywords (Korean etc.): use includes
      return text.includes(kw);
    })) {
      return category;
    }
  }
  return 'General';
}

/**
 * Extract all rules from a document and enrich them with normalized text,
 * token arrays, and auto-detected categories.
 */
export function extractAndNormalize(
  doc: ClaudeMdDocument
): Array<{ rule: ClaudeMdRule; normalized: string; tokens: string[]; category: string }> {
  return getAllRules(doc).map((rule) => {
    const normalized = normalizeText(rule.text);
    const tokens = tokenize(rule.text);
    const category = categorizeRule(rule);
    return { rule, normalized, tokens, category };
  });
}
