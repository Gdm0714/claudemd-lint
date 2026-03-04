import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaudeMd, getAllRules } from '../parser/claudemd-parser.js';
import { readAnalytics, readConfig } from './storage.js';

/**
 * Load all rules from CLAUDE.md files in cwd.
 */
function loadAllRules(cwd: string): Array<{ id: string; text: string }> {
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
  const results: Array<{ id: string; text: string }> = [];

  for (const filePath of candidates) {
    if (!existsSync(filePath) || seen.has(filePath)) continue;
    seen.add(filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const doc = parseClaudeMd(filePath, content);
      const rules = getAllRules(doc);
      for (const rule of rules) {
        results.push({ id: rule.id, text: rule.text });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

/**
 * Find rules that haven't been referenced in the last N sessions.
 */
export function findStaleRules(
  cwd: string,
  threshold?: number
): Array<{
  ruleId: string;
  ruleText: string;
  lastReferenced: number | null;
  sessionsSinceReference: number;
}> {
  const config = readConfig(cwd);
  const staleThreshold = threshold ?? config.staleSessions;
  const analytics = readAnalytics(cwd);
  const allRules = loadAllRules(cwd);

  const totalSessions = analytics.totalSessions;
  const results: Array<{
    ruleId: string;
    ruleText: string;
    lastReferenced: number | null;
    sessionsSinceReference: number;
  }> = [];

  for (const rule of allRules) {
    const tracked = analytics.rules[rule.id];

    if (!tracked) {
      // Never referenced — counts as maximally stale
      results.push({
        ruleId: rule.id,
        ruleText: rule.text,
        lastReferenced: null,
        sessionsSinceReference: totalSessions,
      });
      continue;
    }

    const lastSessionIdx = (() => {
      // Find the most recent session index that referenced this rule
      const sessions = analytics.sessions;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (tracked.sessionsReferenced.includes(sessions[i].sessionId)) {
          return i;
        }
      }
      return -1;
    })();

    const sessionsSince =
      lastSessionIdx === -1
        ? totalSessions
        : analytics.sessions.length - 1 - lastSessionIdx;

    if (sessionsSince >= staleThreshold) {
      results.push({
        ruleId: rule.id,
        ruleText: rule.text,
        lastReferenced: tracked.lastReferenced,
        sessionsSinceReference: sessionsSince,
      });
    }
  }

  return results;
}

/**
 * Find rules that have never been referenced at all.
 */
export function findNeverReferencedRules(
  cwd: string
): Array<{ ruleId: string; ruleText: string }> {
  const analytics = readAnalytics(cwd);
  const allRules = loadAllRules(cwd);

  return allRules
    .filter((rule) => !analytics.rules[rule.id])
    .map((rule) => ({ ruleId: rule.id, ruleText: rule.text }));
}
