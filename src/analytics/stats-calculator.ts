import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaudeMd, getAllRules } from '../parser/claudemd-parser.js';
import { readAnalytics, readSuggestions, readCorrections, readConfig } from './storage.js';
import { findStaleRules, findNeverReferencedRules } from './staleness-detector.js';

export interface DashboardStats {
  totalRules: number;
  totalRuleFiles: number;
  totalReferences: number;
  sessionsTracked: number;
  mostReferencedRules: Array<{ ruleId: string; ruleText: string; count: number }>;
  leastReferencedRules: Array<{ ruleId: string; ruleText: string; count: number }>;
  staleRulesCount: number;
  neverReferencedCount: number;
  correctionsDetected: number;
  rulesSuggested: number;
  rulesAccepted: number;
  conversionRate: number; // accepted / total corrections (0-1)
  avgCorrectionsPerSession: number;
}

function loadAllRulesFromFiles(cwd: string): { count: number; files: number } {
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
  let count = 0;
  let files = 0;

  for (const filePath of candidates) {
    if (!existsSync(filePath) || seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const doc = parseClaudeMd(filePath, content);
      const rules = getAllRules(doc);
      count += rules.length;
      files += 1;
    } catch {
      // Skip unreadable files
    }
  }

  return { count, files };
}

export function calculateStats(cwd: string): DashboardStats {
  const analytics = readAnalytics(cwd);
  const corrections = readCorrections(cwd);
  const suggestions = readSuggestions(cwd);
  const config = readConfig(cwd);

  const { count: totalRules, files: totalRuleFiles } = loadAllRulesFromFiles(cwd);

  // Reference stats
  const totalReferences = Object.values(analytics.rules).reduce(
    (sum, r) => sum + r.totalReferences,
    0
  );
  const sessionsTracked = analytics.totalSessions;

  // Sort rules by reference count
  const sortedRules = Object.values(analytics.rules).sort(
    (a, b) => b.totalReferences - a.totalReferences
  );

  const mostReferencedRules = sortedRules.slice(0, 10).map((r) => ({
    ruleId: r.ruleId,
    ruleText: r.ruleText,
    count: r.totalReferences,
  }));

  const leastReferencedRules = sortedRules
    .slice(-10)
    .reverse()
    .map((r) => ({
      ruleId: r.ruleId,
      ruleText: r.ruleText,
      count: r.totalReferences,
    }));

  // Staleness stats
  const staleRules = findStaleRules(cwd, config.staleSessions);
  const neverReferenced = findNeverReferencedRules(cwd);

  // Correction / suggestion stats
  const correctionsDetected = corrections.length;
  const rulesSuggested = suggestions.length;
  const rulesAccepted = suggestions.filter((s) => s.status === 'accepted').length;

  const conversionRate =
    correctionsDetected > 0 ? rulesAccepted / correctionsDetected : 0;

  const avgCorrectionsPerSession =
    sessionsTracked > 0 ? correctionsDetected / sessionsTracked : 0;

  return {
    totalRules,
    totalRuleFiles,
    totalReferences,
    sessionsTracked,
    mostReferencedRules,
    leastReferencedRules,
    staleRulesCount: staleRules.length,
    neverReferencedCount: neverReferenced.length,
    correctionsDetected,
    rulesSuggested,
    rulesAccepted,
    conversionRate,
    avgCorrectionsPerSession,
  };
}
