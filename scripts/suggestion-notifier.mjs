#!/usr/bin/env node
/**
 * SessionStart hook: notify user of pending rule suggestions
 * and warn if CLAUDE.md health score is low.
 * Checks .claudemd-lint/suggestions.json for pending items,
 * then does a quick inline health check on CLAUDE.md.
 */

import { readStdin, createHookOutput, getStorageDir } from './lib/stdin.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Quick inline health score for CLAUDE.md (no TypeScript imports).
 * Returns a score 0-100 or null if no CLAUDE.md found.
 */
function computeQuickHealthScore(cwd) {
  // Find CLAUDE.md
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];
  const claudeMdPath = candidates.find((p) => existsSync(p));
  if (!claudeMdPath) return null;

  let content;
  try {
    content = readFileSync(claudeMdPath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');

  // Extract rules: bullet points and numbered items
  const rules = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const bulletMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bulletMatch && bulletMatch[1].trim().length > 10) {
      rules.push(bulletMatch[1].trim());
      continue;
    }
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numberedMatch && numberedMatch[1].trim().length > 10) {
      rules.push(numberedMatch[1].trim());
    }
  }

  const totalRules = rules.length;

  // Check for identical duplicates (case-insensitive, trimmed)
  const normalized = rules.map((r) => r.toLowerCase().trim());
  const seen = new Set();
  let duplicateCount = 0;
  for (const n of normalized) {
    if (seen.has(n)) {
      duplicateCount++;
    } else {
      seen.add(n);
    }
  }

  // Compute simplified score: start at 100
  let score = 100;
  score -= duplicateCount * 10;
  if (totalRules > 100 || totalRules < 3) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

async function main() {
  const raw = await readStdin(3000);
  let cwd = process.cwd();
  try {
    const data = JSON.parse(raw);
    cwd = data.cwd || data.directory || cwd;
  } catch {}

  const storageDir = getStorageDir(cwd);
  const messageParts = [];

  // --- Check pending suggestions ---
  const suggestionsPath = join(storageDir, 'suggestions.json');
  if (existsSync(suggestionsPath)) {
    try {
      const suggestions = JSON.parse(readFileSync(suggestionsPath, 'utf-8'));
      const pending = suggestions.filter((s) => s.status === 'pending');
      if (pending.length > 0) {
        messageParts.push(
          `You have ${pending.length} pending CLAUDE.md rule suggestion${pending.length > 1 ? 's' : ''} based on repeated corrections.`,
          `Run /claudemd-suggest to review and apply them.`,
          `Top suggestion: "${pending[0].ruleText}" (confidence: ${Math.round(pending[0].confidence * 100)}%)`
        );
      }
    } catch {
      // Ignore corrupt suggestions file
    }
  }

  // --- Quick health score check ---
  try {
    const healthScore = computeQuickHealthScore(cwd);
    if (healthScore !== null && healthScore < 70) {
      messageParts.push(
        `Your CLAUDE.md health score is ${healthScore}/100. Run /claudemd-health for details.`
      );
    }
  } catch {
    // Health check is best-effort; never block session start
  }

  // --- Output ---
  if (messageParts.length === 0) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const message = [
    `<claudemd-lint>`,
    ...messageParts,
    `</claudemd-lint>`,
  ].join('\n');

  console.log(JSON.stringify(createHookOutput('SessionStart', message)));
}

try {
  await main();
} catch {
  console.log(JSON.stringify({ continue: true }));
}
