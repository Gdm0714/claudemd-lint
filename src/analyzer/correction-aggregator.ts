// ============================================================
// claudemd-lint — Correction Aggregator
// ============================================================

import type { Correction, CorrectionCategory } from '../types.js';
import { readCorrections } from '../analytics/storage.js';

export interface CorrectionGroup {
  topic: string;
  category: CorrectionCategory;
  corrections: Correction[];
  occurrences: number;
  keywords: string[];
  representativeRule: string;
}

// Common English stop words to filter out during keyword extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'or', 'and', 'but', 'not', 'no', 'do',
  'does', 'did', 'be', 'am', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having', 'will', 'would', 'could', 'should',
  'may', 'might', 'shall', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us',
  'them', 'my', 'your', 'his', 'its', 'our', 'their', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'than',
  'too', 'very', 'just', 'about', 'above', 'after', 'again', 'also',
  'any', 'because', 'before', 'between', 'during', 'if', 'into',
  'only', 'own', 'same', 'so', 'then', 'there', 'through', 'under',
  'up', 'out', 'over', 'use', 'using', 'don', 'dont', 'always',
  'never', 'make', 'sure', 'please', 'stop', 'keep', 'want',
]);

/**
 * Tokenize text into normalized words, removing stop words and short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Calculate term frequency across a set of documents (correction rules).
 * Returns a map of term -> document frequency (number of docs containing it).
 */
function calculateDocumentFrequency(documents: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of documents) {
    const unique = new Set(tokens);
    for (const token of unique) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  return df;
}

/**
 * Extract top keywords from a correction's rule text using TF-IDF weighting.
 */
function extractKeywords(
  tokens: string[],
  df: Map<string, number>,
  totalDocs: number,
  topK: number = 5
): string[] {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  const scored: Array<{ term: string; score: number }> = [];
  for (const [term, freq] of tf) {
    const docFreq = df.get(term) ?? 1;
    const idf = Math.log(totalDocs / docFreq);
    scored.push({ term, score: freq * idf });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.term);
}

/**
 * Calculate Jaccard similarity between two keyword sets.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Group corrections by topic using TF-IDF keyword overlap.
 * Corrections with similar keywords (Jaccard >= threshold) are grouped together.
 */
export function groupCorrections(
  corrections: Correction[],
  similarityThreshold: number = 0.3
): CorrectionGroup[] {
  if (corrections.length === 0) return [];

  // Tokenize all corrections
  const tokenized = corrections.map((c) => tokenize(c.extractedRule));
  const df = calculateDocumentFrequency(tokenized);
  const totalDocs = corrections.length;

  // Extract keywords for each correction
  const keywordsPerCorrection = tokenized.map((tokens) =>
    extractKeywords(tokens, df, totalDocs)
  );

  // Greedy clustering: assign each correction to the first matching group
  const groups: CorrectionGroup[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < corrections.length; i++) {
    if (assigned.has(i)) continue;

    const group: CorrectionGroup = {
      topic: keywordsPerCorrection[i].join(', '),
      category: corrections[i].category,
      corrections: [corrections[i]],
      occurrences: 1,
      keywords: keywordsPerCorrection[i],
      representativeRule: corrections[i].extractedRule,
    };
    assigned.add(i);

    // Find similar corrections
    for (let j = i + 1; j < corrections.length; j++) {
      if (assigned.has(j)) continue;

      const similarity = jaccardSimilarity(
        keywordsPerCorrection[i],
        keywordsPerCorrection[j]
      );

      if (similarity >= similarityThreshold) {
        group.corrections.push(corrections[j]);
        group.occurrences++;
        assigned.add(j);
      }
    }

    // Pick the most common phrasing as representative
    if (group.corrections.length > 1) {
      group.representativeRule = pickRepresentativeRule(group.corrections);
    }

    groups.push(group);
  }

  return groups.sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Pick the best representative rule from a group of corrections.
 * Prefers higher confidence and more common phrasings.
 */
function pickRepresentativeRule(corrections: Correction[]): string {
  // Count exact rule occurrences
  const counts = new Map<string, number>();
  for (const c of corrections) {
    const normalized = c.extractedRule.toLowerCase().trim();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  // Find the most common phrasing
  let maxCount = 0;
  let bestRule = corrections[0].extractedRule;
  for (const c of corrections) {
    const normalized = c.extractedRule.toLowerCase().trim();
    const count = counts.get(normalized) ?? 0;
    if (count > maxCount || (count === maxCount && c.confidence > 0.8)) {
      maxCount = count;
      bestRule = c.extractedRule;
    }
  }

  return bestRule;
}

/**
 * Aggregate corrections from storage, grouped by topic.
 */
export function aggregateCorrections(
  cwd: string,
  similarityThreshold?: number
): CorrectionGroup[] {
  const corrections = readCorrections(cwd);
  return groupCorrections(corrections, similarityThreshold);
}

/**
 * Get groups that meet the minimum occurrence threshold.
 */
export function getFrequentGroups(
  cwd: string,
  minOccurrences: number = 3,
  similarityThreshold?: number
): CorrectionGroup[] {
  return aggregateCorrections(cwd, similarityThreshold).filter(
    (g) => g.occurrences >= minOccurrences
  );
}
