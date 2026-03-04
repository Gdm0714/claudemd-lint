// ============================================================
// claudemd-lint — CLAUDE.md Health Scorer
// ============================================================

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findDuplicates } from '../parser/dedup-engine.js';
import { findStaleRules } from './staleness-detector.js';
import { readAnalytics, readCorrections, readSuggestions, readConfig } from './storage.js';
import { parseClaudeMd, getAllRules } from '../parser/claudemd-parser.js';
import { categorizeRule } from '../parser/rule-extractor.js';
import type {
  HealthReport,
  HealthFactor,
  ClaudeMdDocument,
  ClaudeMdRule,
} from '../types.js';

// --- CLAUDE.md File Discovery ---

/**
 * Find and parse all CLAUDE.md files reachable from cwd.
 * Checks CLAUDE.md, .claude/CLAUDE.md, and up to 3 parent dirs.
 */
function findAndParseClaudeMdFiles(cwd: string): ClaudeMdDocument[] {
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];

  let dir = cwd;
  for (let i = 0; i < 3; i++) {
    const parent = join(dir, '..');
    if (parent === dir) break;
    candidates.push(join(parent, 'CLAUDE.md'));
    dir = parent;
  }

  const seen = new Set<string>();
  const docs: ClaudeMdDocument[] = [];

  for (const filePath of candidates) {
    if (!existsSync(filePath) || seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      docs.push(parseClaudeMd(filePath, content));
    } catch {
      // Skip unreadable files
    }
  }

  return docs;
}

// --- Grade Mapping ---

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

// --- Individual Factor Scorers ---

/**
 * Score duplicate ratio (weight: 0.25).
 * 100 = 0 duplicates, 0 = >30% of rules are duplicates.
 */
function scoreDuplicates(docs: ClaudeMdDocument[], totalRules: number): HealthFactor {
  let totalDuplicates = 0;
  for (const doc of docs) {
    const report = findDuplicates(doc);
    totalDuplicates += report.duplicates.length;
  }

  const ratio = totalRules > 0 ? totalDuplicates / totalRules : 0;
  // Linear scale: 0% duplicates = 100, 30%+ = 0
  const score = Math.max(0, Math.min(100, Math.round((1 - ratio / 0.3) * 100)));

  const detail =
    totalDuplicates === 0
      ? 'No duplicate rules found'
      : `${totalDuplicates} duplicate rule${totalDuplicates > 1 ? 's' : ''} found (${Math.round(ratio * 100)}% of rules)`;

  return { name: 'Duplicates', score, weight: 0.12, detail };
}

/**
 * Score stale rule ratio (weight: 0.15).
 * 100 = 0 stale rules, 0 = >50% of rules are stale.
 * If insufficient analytics data, returns a capped score of 40.
 */
function scoreStaleRules(cwd: string, totalRules: number): HealthFactor {
  const analytics = readAnalytics(cwd);

  // Not enough tracking data — cap at 40 to incentivize using the plugin
  if (analytics.totalSessions < 5) {
    return {
      name: 'Stale Rules',
      score: 40,
      weight: 0.15,
      detail: `Only ${analytics.totalSessions} session${analytics.totalSessions !== 1 ? 's' : ''} tracked — need 5+ for accurate staleness detection`,
    };
  }

  const stale = findStaleRules(cwd);
  const staleCount = stale.length;

  const ratio = totalRules > 0 ? staleCount / totalRules : 0;
  // Linear scale: 0% stale = 100, 50%+ = 0
  const score = Math.max(0, Math.min(100, Math.round((1 - ratio / 0.5) * 100)));

  const detail =
    staleCount === 0
      ? 'All rules are actively referenced'
      : `${staleCount} stale rule${staleCount > 1 ? 's' : ''} unreferenced in recent sessions`;

  return { name: 'Stale Rules', score, weight: 0.15, detail };
}

/**
 * Score section structure (weight: 0.15).
 * 100 = all rules in categorized sections, 0 = flat rules with no sections.
 */
function scoreSectionStructure(docs: ClaudeMdDocument[], allRules: ClaudeMdRule[]): HealthFactor {
  if (allRules.length === 0) {
    return { name: 'Section Structure', score: 100, weight: 0.08, detail: 'No rules to organize' };
  }

  // Count sections with headings across all docs
  let totalSections = 0;
  for (const doc of docs) {
    function countSections(sections: ClaudeMdDocument['sections']): void {
      for (const sec of sections) {
        if (sec.heading !== '') totalSections++;
        countSections(sec.children);
      }
    }
    countSections(doc.sections);
  }

  if (totalSections === 0) {
    return { name: 'Section Structure', score: 0, weight: 0.08, detail: 'No section headings — rules are unorganized' };
  }

  // Collect all section IDs that have headings
  const headingSectionIds = new Set<string>();
  for (const doc of docs) {
    function collectIds(sections: ClaudeMdDocument['sections']): void {
      for (const sec of sections) {
        if (sec.heading !== '') headingSectionIds.add(sec.id);
        collectIds(sec.children);
      }
    }
    collectIds(doc.sections);
  }

  // Ratio of rules in headed sections vs total rules
  const categorizedRules = allRules.filter((r) => headingSectionIds.has(r.sectionId)).length;
  const ratio = categorizedRules / allRules.length;
  const score = Math.round(ratio * 100);

  const detail =
    score === 100
      ? `All ${allRules.length} rules organized in ${totalSections} sections`
      : `${categorizedRules}/${allRules.length} rules in sections (${totalSections} sections found)`;

  return { name: 'Section Structure', score, weight: 0.08, detail };
}

/**
 * Score rule count balance (weight: 0.15).
 * 100 = 10-50 rules (sweet spot), 0 = 0 rules or >200 rules.
 */
function scoreRuleCount(totalRules: number): HealthFactor {
  let score: number;
  let detail: string;

  if (totalRules === 0) {
    score = 0;
    detail = 'No rules found — CLAUDE.md is empty or missing';
  } else if (totalRules < 10) {
    // Linear ramp from 0 at 0 rules to 100 at 10 rules
    score = Math.round((totalRules / 10) * 100);
    detail = `Only ${totalRules} rule${totalRules > 1 ? 's' : ''} — consider adding more guidance`;
  } else if (totalRules <= 50) {
    score = 100;
    detail = `${totalRules} rules — well-balanced rule count`;
  } else if (totalRules <= 200) {
    // Linear decline from 100 at 50 to 0 at 200
    score = Math.round(((200 - totalRules) / 150) * 100);
    detail = `${totalRules} rules — getting large, consider consolidating`;
  } else {
    score = 0;
    detail = `${totalRules} rules — too many rules reduce clarity`;
  }

  return { name: 'Rule Count', score, weight: 0.10, detail };
}

/**
 * Score conflict count (weight: 0.15).
 * 100 = 0 conflicts, 0 = >3 conflicts.
 */
function scoreConflicts(docs: ClaudeMdDocument[]): HealthFactor {
  let totalConflicts = 0;
  for (const doc of docs) {
    const report = findDuplicates(doc);
    totalConflicts += report.conflicts.length;
  }

  // Linear scale: 0 conflicts = 100, 3+ = 0
  const score = Math.max(0, Math.min(100, Math.round((1 - totalConflicts / 3) * 100)));

  const detail =
    totalConflicts === 0
      ? 'No conflicting rules detected'
      : `${totalConflicts} conflicting rule${totalConflicts > 1 ? 's' : ''} found`;

  return { name: 'Conflicts', score, weight: 0.07, detail };
}

/**
 * Score correction conversion rate (weight: 0.10).
 * 100 = >50% corrections became rules, 0 = 0% conversion.
 */
function scoreCorrectionConversion(cwd: string): HealthFactor {
  const corrections = readCorrections(cwd);
  const suggestions = readSuggestions(cwd);

  if (corrections.length === 0) {
    return {
      name: 'Conversion Rate',
      score: 30,
      weight: 0.13,
      detail: 'No corrections detected yet — use Claude Code more to build tracking data',
    };
  }

  const accepted = suggestions.filter((s) => s.status === 'accepted').length;
  const conversionRate = accepted / corrections.length;

  // Linear scale: 50%+ conversion = 100, 0% = 0
  const score = Math.max(0, Math.min(100, Math.round((conversionRate / 0.5) * 100)));

  const detail = `${accepted} of ${corrections.length} corrections converted to rules (${Math.round(conversionRate * 100)}%)`;

  return { name: 'Conversion Rate', score, weight: 0.13, detail };
}

/**
 * Score category diversity (weight: 0.15).
 * 100 = rules spread across 4+ categories, 0 = all rules in 1 category.
 * Available categories: Build & Run, Testing, Code Style, Version Control, Deployment, Conventions, General.
 */
function scoreCategoryDiversity(allRules: ClaudeMdRule[]): HealthFactor {
  if (allRules.length === 0) {
    return { name: 'Category Diversity', score: 0, weight: 0.15, detail: 'No rules to categorize' };
  }

  const categories = new Set<string>();
  for (const rule of allRules) {
    categories.add(categorizeRule(rule));
  }

  // Remove 'General' from count — it's a fallback, not real diversity
  const meaningfulCategories = [...categories].filter((c) => c !== 'General').length;
  const hasGeneral = categories.has('General');
  const totalCategories = meaningfulCategories;

  // Score: 4+ categories = 100, 3 = 80, 2 = 50, 1 = 25, 0 (all General) = 10
  let score: number;
  let detail: string;

  if (totalCategories >= 4) {
    score = 100;
    detail = `Rules span ${totalCategories} categories — excellent diversity`;
  } else if (totalCategories === 3) {
    score = 80;
    detail = `Rules span 3 categories — good diversity`;
  } else if (totalCategories === 2) {
    score = 50;
    detail = `Rules span only 2 categories — consider adding build, test, or style rules`;
  } else if (totalCategories === 1) {
    score = 25;
    detail = `Rules concentrated in 1 category — add rules for other areas`;
  } else {
    // All rules are 'General' — no clear categorization
    score = 10;
    detail = 'Rules lack specific keywords — use terms like "test", "build", "git", "style"';
  }

  // Penalize if >60% of rules are 'General' (uncategorized)
  if (hasGeneral && allRules.length > 0) {
    const generalCount = allRules.filter((r) => categorizeRule(r) === 'General').length;
    const generalRatio = generalCount / allRules.length;
    if (generalRatio > 0.6 && score > 30) {
      score = Math.round(score * 0.6);
      detail += ` (${Math.round(generalRatio * 100)}% of rules are uncategorized)`;
    }
  }

  return { name: 'Category Diversity', score, weight: 0.15, detail };
}

/**
 * Score rule actionability (weight: 0.20).
 * 100 = most rules have clear directives, 0 = vague/generic rules.
 * Supports both English and Korean directive words.
 */
function scoreActionability(allRules: ClaudeMdRule[]): HealthFactor {
  if (allRules.length === 0) {
    return { name: 'Actionability', score: 0, weight: 0.20, detail: 'No rules to evaluate' };
  }

  const DIRECTIVE_WORDS = /\b(always|never|must|should|use|avoid|prefer|ensure|require|run|don't|do not|make sure|forbidden|prohibited)\b/i;
  const KOREAN_DIRECTIVES = /(반드시|금지|절대|필수|사용하세요|하지\s*마|않도록|해야|불가|안\s*됨|주의|확인\s*필요|필요합니다|하세요|마세요|말\s*것)/;

  // Only evaluate directive-capable rules (bullets, numbered, paragraphs).
  // Code blocks and table rows are reference material, not directives.
  const directiveRules = allRules.filter((r) => r.type !== 'codeblock' && r.type !== 'table-row');
  if (directiveRules.length === 0) {
    return { name: 'Actionability', score: 50, weight: 0.20, detail: 'No directive-type rules found (only code blocks/tables)' };
  }

  let actionableCount = 0;
  for (const rule of directiveRules) {
    if (DIRECTIVE_WORDS.test(rule.text) || KOREAN_DIRECTIVES.test(rule.text)) {
      actionableCount++;
    }
  }

  const ratio = actionableCount / directiveRules.length;
  // 70%+ actionable = 100, linearly to 0 at 0%
  const score = Math.max(0, Math.min(100, Math.round((ratio / 0.7) * 100)));

  const detail =
    ratio >= 0.7
      ? `${actionableCount}/${directiveRules.length} rules have clear directives — excellent`
      : ratio >= 0.4
        ? `${actionableCount}/${directiveRules.length} rules have directives — add "always/never/must" to vague rules`
        : `Only ${actionableCount}/${directiveRules.length} rules have clear directives — most rules are too vague`;

  return { name: 'Actionability', score, weight: 0.20, detail };
}

/**
 * Score rule specificity (weight: 0.15).
 * Replaces Stale Rules when no analytics data is available.
 * Measures how concrete and project-specific rules are:
 * file paths, inline code, specific values, CLI commands, constants.
 */
function scoreSpecificity(allRules: ClaudeMdRule[]): HealthFactor {
  if (allRules.length === 0) {
    return { name: 'Specificity', score: 0, weight: 0.15, detail: 'No rules to evaluate' };
  }

  const FILE_REF_RE = /[a-zA-Z_][\w.-]*\.(?:ts|js|py|go|rs|java|json|yaml|yml|toml|md|sh|sql|tsx|jsx|css|html|vue|svelte|rb|php|c|cpp|h)\b/;
  const PATH_RE = /(?:\/[\w.-]+){2,}|(?:[\w.-]+\/){2,}/;
  const INLINE_CODE_RE = /`[^`]{3,}`/;
  const SPECIFIC_VALUE_RE = /\b\d+(?:\.\d+)?(?:\s*(?:byte|bytes|mb|gb|ms|sec|second|minute|min|percent|%|px|rem|em|pt|vh|vw)s?)?\b/i;
  const COMMAND_RE = /\b(?:npm|npx|yarn|pnpm|pip|cargo|go|gradle|gradlew|maven|mvn|docker|kubectl|git)\s+\w+/i;
  const ENV_VAR_RE = /\b[A-Z][A-Z_]{2,}\b/;

  let specificCount = 0;
  for (const rule of allRules) {
    if (rule.type === 'codeblock') {
      specificCount++;
      continue;
    }
    const text = rule.text;
    if (
      FILE_REF_RE.test(text) ||
      PATH_RE.test(text) ||
      INLINE_CODE_RE.test(text) ||
      SPECIFIC_VALUE_RE.test(text) ||
      COMMAND_RE.test(text) ||
      ENV_VAR_RE.test(text)
    ) {
      specificCount++;
    }
  }

  const ratio = specificCount / allRules.length;
  const score = Math.max(0, Math.min(100, Math.round((ratio / 0.6) * 100)));

  const detail =
    ratio >= 0.6
      ? `${specificCount}/${allRules.length} rules reference concrete files, code, or values — excellent`
      : ratio >= 0.3
        ? `${specificCount}/${allRules.length} rules are specific — add file paths, code refs, or values to vague rules`
        : `Only ${specificCount}/${allRules.length} rules are specific — most rules are too abstract`;

  return { name: 'Specificity', score, weight: 0.15, detail };
}

/**
 * Score CLAUDE.md completeness (weight: 0.13).
 * Replaces Conversion Rate when no analytics data is available.
 * Checks if essential topics are covered: build commands, conventions,
 * testing, project structure, version control, plus code examples.
 */
function scoreCompleteness(docs: ClaudeMdDocument[], allRules: ClaudeMdRule[]): HealthFactor {
  if (allRules.length === 0) {
    return { name: 'Completeness', score: 0, weight: 0.13, detail: 'No content to evaluate' };
  }

  const allText = docs.map((d) => d.rawContent.toLowerCase()).join('\n');

  const topics = [
    { name: 'Build/Run', re: /\b(npm|npx|yarn|pnpm|pip|cargo|gradle|gradlew|docker|make|mvn|maven)\b|빌드|실행|컴파일|설치/i },
    { name: 'Code conventions', re: /\b(style|convention|naming|format|lint|indent|import|export)\b|컨벤션|네이밍|스타일|포맷/i },
    { name: 'Testing', re: /\b(test|spec|coverage|assert|verify|jest|vitest|pytest)\b|테스트|검증|커버리지/i },
    { name: 'Project structure', re: /(?:\b(?:structure|directory|folder|layout)\b|src\/|[├└│])|구조|디렉토리|폴더/i },
    { name: 'Version control', re: /\b(git|commit|branch|merge|pr|pull\s+request)\b|커밋|브랜치|병합/i },
  ];

  let coveredCount = 0;
  const missing: string[] = [];

  for (const topic of topics) {
    if (topic.re.test(allText)) {
      coveredCount++;
    } else {
      missing.push(topic.name);
    }
  }

  const hasCodeBlocks = allRules.some((r) => r.type === 'codeblock');
  if (hasCodeBlocks) coveredCount += 1;

  const maxPoints = topics.length + 1;
  const ratio = Math.min(1, coveredCount / maxPoints);
  const score = Math.round(ratio * 100);

  const detail =
    missing.length === 0
      ? `Covers all essential topics${hasCodeBlocks ? ' with code examples' : ''}`
      : `Missing: ${missing.join(', ')} — ${coveredCount}/${maxPoints} areas covered`;

  return { name: 'Completeness', score, weight: 0.13, detail };
}

// --- Recommendation Generator ---

function generateRecommendations(
  factors: HealthFactor[],
  docs: ClaudeMdDocument[],
  allRules: ClaudeMdRule[],
  totalRules: number,
  cwd: string
): string[] {
  const recommendations: string[] = [];

  // Sort factors by score ascending (worst first)
  const sorted = [...factors].sort((a, b) => a.score - b.score);

  for (const factor of sorted) {
    if (recommendations.length >= 3) break;
    if (factor.score >= 80) continue; // No recommendation needed for good scores

    switch (factor.name) {
      case 'Duplicates': {
        let dupCount = 0;
        for (const doc of docs) {
          dupCount += findDuplicates(doc).duplicates.length;
        }
        if (dupCount > 0) {
          recommendations.push(
            `Remove ${dupCount} duplicate rule${dupCount > 1 ? 's' : ''} to improve clarity`
          );
        }
        break;
      }
      case 'Stale Rules': {
        const stale = findStaleRules(cwd);
        const config = readConfig(cwd);
        if (stale.length > 0) {
          recommendations.push(
            `Review ${stale.length} stale rule${stale.length > 1 ? 's' : ''} that haven't been referenced in ${config.staleSessions}+ sessions`
          );
        }
        break;
      }
      case 'Section Structure': {
        if (totalRules > 0) {
          recommendations.push(
            `Add section headings to organize your ${totalRules} rules into categories`
          );
        }
        break;
      }
      case 'Rule Count': {
        if (totalRules === 0) {
          recommendations.push('Add rules to your CLAUDE.md to guide AI behavior');
        } else if (totalRules < 10) {
          recommendations.push(
            `Add more rules — ${totalRules} is below the recommended minimum of 10`
          );
        } else if (totalRules > 50) {
          recommendations.push(
            `Consolidate rules — ${totalRules} is above the recommended maximum of 50`
          );
        }
        break;
      }
      case 'Conflicts': {
        let conflictCount = 0;
        for (const doc of docs) {
          conflictCount += findDuplicates(doc).conflicts.length;
        }
        if (conflictCount > 0) {
          recommendations.push(
            `You have ${conflictCount} conflicting rule${conflictCount > 1 ? 's' : ''} — run /claudemd-organize to resolve`
          );
        }
        break;
      }
      case 'Category Diversity': {
        const cats = new Set(allRules.filter((r) => categorizeRule(r) !== 'General').map((r) => categorizeRule(r)));
        const missing: string[] = [];
        for (const c of ['Build & Run', 'Testing', 'Code Style', 'Version Control']) {
          if (!cats.has(c)) missing.push(c);
        }
        if (missing.length > 0) {
          recommendations.push(
            `Add rules for: ${missing.slice(0, 2).join(', ')} — diversify your CLAUDE.md coverage`
          );
        }
        break;
      }
      case 'Actionability': {
        const DIRECTIVE_RE = /\b(always|never|must|should|use|avoid|prefer|ensure|require|run|don't|do not|make sure|forbidden|prohibited)\b/i;
        const KOREAN_RE = /(반드시|금지|절대|필수|사용하세요|하지\s*마|않도록|해야|불가|안\s*됨|주의|확인\s*필요|필요합니다|하세요|마세요|말\s*것)/;
        const vague = allRules.filter((r) => !DIRECTIVE_RE.test(r.text) && !KOREAN_RE.test(r.text));
        if (vague.length > 0) {
          recommendations.push(
            `${vague.length} rule${vague.length > 1 ? 's' : ''} lack directive words — add "always/never/must" (or 반드시/금지/절대) for clarity`
          );
        }
        break;
      }
      case 'Conversion Rate': {
        const corrections = readCorrections(cwd);
        const suggestions = readSuggestions(cwd);
        const pending = suggestions.filter((s) => s.status === 'pending').length;
        if (pending > 0) {
          recommendations.push(
            `Review ${pending} pending suggestion${pending > 1 ? 's' : ''} — run /claudemd-suggest to accept or dismiss`
          );
        } else if (corrections.length > 0) {
          recommendations.push(
            'Convert more corrections into permanent rules to improve consistency'
          );
        }
        break;
      }
      case 'Specificity': {
        const FILE_REF_RE = /[a-zA-Z_][\w.-]*\.(?:ts|js|py|go|rs|java|json|yaml|yml|toml|md|sh|sql|tsx|jsx|css|html)\b/;
        const INLINE_CODE_RE = /`[^`]{3,}`/;
        const vague = allRules.filter(
          (r) => r.type !== 'codeblock' && !FILE_REF_RE.test(r.text) && !INLINE_CODE_RE.test(r.text)
        );
        if (vague.length > 0) {
          recommendations.push(
            `${vague.length} rule${vague.length > 1 ? 's' : ''} lack concrete references — add file paths, \`code\`, or specific values`
          );
        }
        break;
      }
      case 'Completeness': {
        recommendations.push(factor.detail.startsWith('Missing')
          ? factor.detail.replace('Missing: ', 'Add sections for: ')
          : 'Add code examples to improve completeness'
        );
        break;
      }
    }
  }

  return recommendations;
}

// --- Main Entry Point ---

/**
 * Calculate CLAUDE.md health score (0-100) with factor breakdown.
 *
 * When analytics data is available (5+ sessions): uses Stale Rules and Conversion Rate.
 * When not available: substitutes Specificity and Completeness to avoid fixed-score factors
 * that prevent differentiation between projects.
 */
export function calculateHealth(cwd: string): HealthReport {
  const docs = findAndParseClaudeMdFiles(cwd);

  // Collect all rules across all documents
  const allRules: ClaudeMdRule[] = [];
  for (const doc of docs) {
    allRules.push(...getAllRules(doc));
  }
  const totalRules = allRules.length;

  // Check analytics availability to choose factor set
  const analytics = readAnalytics(cwd);
  const hasAnalytics = analytics.totalSessions >= 5;

  // Compute 8 factors — 6 always + 2 conditional
  const factors: HealthFactor[] = [
    scoreDuplicates(docs, totalRules),
    hasAnalytics
      ? scoreStaleRules(cwd, totalRules)
      : scoreSpecificity(allRules),
    scoreSectionStructure(docs, allRules),
    scoreRuleCount(totalRules),
    scoreConflicts(docs),
    hasAnalytics
      ? scoreCorrectionConversion(cwd)
      : scoreCompleteness(docs, allRules),
    scoreCategoryDiversity(allRules),
    scoreActionability(allRules),
  ];

  // Weighted sum
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  const grade = scoreToGrade(score);
  const recommendations = generateRecommendations(factors, docs, allRules, totalRules, cwd);

  return { score, grade, factors, recommendations };
}
