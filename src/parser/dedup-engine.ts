import type {
  ClaudeMdDocument,
  ClaudeMdRule,
  ClaudeMdSection,
  ConflictPair,
  DuplicatePair,
  DuplicateReport,
  MisplacedRule,
} from '../types.js';
import { extractAndNormalize, categorizeRule, tokenize } from './rule-extractor.js';

const POSITIVE_MODIFIERS = new Set(['always', 'must', 'should']);
const NEGATIVE_MODIFIERS = new Set(['never', "don't", 'avoid', 'do not']);

/**
 * Compute Jaccard similarity between two token sets.
 * jaccard(A, B) = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Compute overlap coefficient: |intersection| / min(|A|, |B|).
 * Better than Jaccard for detecting when one rule is a restatement of another.
 */
function overlapCoefficient(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length < 2 || tokensB.length < 2) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

/**
 * Find duplicate rule pairs within a document.
 * Uses both Jaccard similarity and overlap coefficient to catch
 * duplicates even when one rule has extra words (e.g., "Always use X" vs "Use X").
 *
 * Jaccard > 0.9 → exact duplicate
 * Jaccard > 0.7 OR overlap > 0.8 → semantic duplicate
 */
function findDuplicatePairs(
  enriched: Array<{ rule: ClaudeMdRule; tokens: string[] }>
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const a = enriched[i];
      const b = enriched[j];

      // Skip same rule (same id)
      if (a.rule.id === b.rule.id) continue;

      // Skip pairs where either rule has fewer than 3 tokens —
      // not enough signal for reliable comparison (common with Korean/CJK text
      // where the tokenizer strips non-ASCII, leaving only a few English words)
      if (a.tokens.length < 3 || b.tokens.length < 3) continue;

      const jaccard = jaccardSimilarity(a.tokens, b.tokens);
      const overlap = overlapCoefficient(a.tokens, b.tokens);

      if (jaccard > 0.9) {
        pairs.push({ ruleA: a.rule, ruleB: b.rule, similarity: jaccard, type: 'exact' });
      } else if (jaccard > 0.7 || overlap > 0.8) {
        const score = Math.max(jaccard, overlap);
        pairs.push({ ruleA: a.rule, ruleB: b.rule, similarity: score, type: 'semantic' });
      }
    }
  }

  return pairs;
}

/**
 * Detect conflicting rules: one positive ("always X") vs one negative ("never X")
 * on the same topic, detected by overlapping non-modifier keywords.
 */
export function detectConflicts(
  rules: Array<{ rule: ClaudeMdRule; tokens: string[] }>
): ConflictPair[] {
  const conflicts: ConflictPair[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];

      const setA = new Set(a.tokens);
      const setB = new Set(b.tokens);

      const aPositive = a.tokens.some((t) => POSITIVE_MODIFIERS.has(t));
      const aNegative = a.tokens.some((t) => NEGATIVE_MODIFIERS.has(t));
      const bPositive = b.tokens.some((t) => POSITIVE_MODIFIERS.has(t));
      const bNegative = b.tokens.some((t) => NEGATIVE_MODIFIERS.has(t));

      // One must be positive-only and the other negative-only
      const isConflict =
        (aPositive && !aNegative && bNegative && !bPositive) ||
        (aNegative && !aPositive && bPositive && !bNegative);

      if (!isConflict) continue;

      // Compute overlapping keywords (excluding modifiers themselves)
      const allModifiers = new Set([...POSITIVE_MODIFIERS, ...NEGATIVE_MODIFIERS]);
      const sharedKeywords: string[] = [];
      for (const token of setA) {
        if (!allModifiers.has(token) && setB.has(token)) {
          sharedKeywords.push(token);
        }
      }

      if (sharedKeywords.length > 0) {
        conflicts.push({
          ruleA: a.rule,
          ruleB: b.rule,
          reason: `Conflicting directives on topic: "${sharedKeywords.join(', ')}"`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Detect rules placed in sections that don't match their auto-categorized category.
 */
export function detectMisplaced(
  rules: Array<{ rule: ClaudeMdRule; category: string }>,
  sections: ClaudeMdSection[]
): MisplacedRule[] {
  // Build a map from section id → heading
  const sectionHeadings = new Map<string, string>();
  function collectSections(secs: ClaudeMdSection[]): void {
    for (const sec of secs) {
      sectionHeadings.set(sec.id, sec.heading);
      collectSections(sec.children);
    }
  }
  collectSections(sections);

  const misplaced: MisplacedRule[] = [];

  for (const { rule, category } of rules) {
    if (category === 'General') continue; // General rules can live anywhere

    const currentHeading = sectionHeadings.get(rule.sectionId) ?? '';
    // Check if the current section heading contains the category keywords
    const headingLower = currentHeading.toLowerCase();
    const categoryLower = category.toLowerCase();

    // Simple heuristic: if the category name words are not found in the heading, flag it
    const categoryWords = categoryLower.split(/[^a-z]+/).filter((w) => w.length > 2);
    const matches = categoryWords.some((word) => headingLower.includes(word));

    if (!matches && currentHeading !== '') {
      misplaced.push({
        rule,
        currentSection: currentHeading,
        suggestedSection: category,
      });
    }
  }

  return misplaced;
}

/**
 * Run full duplicate analysis on a document.
 */
export function findDuplicates(doc: ClaudeMdDocument): DuplicateReport {
  const enriched = extractAndNormalize(doc);

  const withTokens = enriched.map(({ rule, tokens }) => ({ rule, tokens }));
  const withCategory = enriched.map(({ rule, category }) => ({ rule, category }));

  // Collect all sections (flat) for misplaced detection
  const allSections: ClaudeMdSection[] = [];
  function flattenSections(secs: ClaudeMdSection[]): void {
    for (const sec of secs) {
      allSections.push(sec);
      flattenSections(sec.children);
    }
  }
  flattenSections(doc.sections);

  const duplicates = findDuplicatePairs(withTokens);
  const conflicts = detectConflicts(withTokens);
  const misplaced = detectMisplaced(withCategory, allSections);

  return { duplicates, conflicts, misplaced };
}
