import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import type { SharedRule, SharedRulesStore } from '../types.js';
import { tokenize } from '../parser/rule-extractor.js';
import { jaccardSimilarity } from '../parser/dedup-engine.js';
import { parseClaudeMd, getAllRules } from '../parser/claudemd-parser.js';
import { writeClaudeMd, addRuleToSection } from '../parser/claudemd-writer.js';

// --- Constants ---

const SHARED_RULES_PATH = join(homedir(), '.claude', 'shared-rules.json');
const SIMILARITY_THRESHOLD = 0.7;

// --- Helpers ---

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function categorizeRuleText(text: string): string {
  const lower = text.toLowerCase();

  const categories: Array<{ keywords: string[]; category: string }> = [
    { keywords: ['build', 'run', 'compile', 'install'], category: 'Build & Run' },
    { keywords: ['test', 'spec', 'coverage'], category: 'Testing' },
    { keywords: ['style', 'format', 'lint', 'prettier'], category: 'Code Style' },
    { keywords: ['git', 'commit', 'branch', 'merge'], category: 'Version Control' },
    { keywords: ['deploy', 'ci', 'cd', 'pipeline'], category: 'Deployment' },
    { keywords: ['never', 'always', 'must', 'should'], category: 'Conventions' },
  ];

  for (const { keywords, category } of categories) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }

  return 'General';
}

// --- Core Functions ---

/**
 * Read the shared rules store from ~/.claude/shared-rules.json.
 */
export function readSharedRules(): SharedRulesStore {
  try {
    if (!existsSync(SHARED_RULES_PATH)) {
      return { rules: [], lastSynced: {} };
    }
    const raw = readFileSync(SHARED_RULES_PATH, 'utf-8');
    return JSON.parse(raw) as SharedRulesStore;
  } catch {
    return { rules: [], lastSynced: {} };
  }
}

/**
 * Write the shared rules store to ~/.claude/shared-rules.json.
 */
export function writeSharedRules(store: SharedRulesStore): void {
  const dir = join(homedir(), '.claude');
  ensureDir(dir);
  writeFileSync(SHARED_RULES_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Add a rule to the global shared store, deduplicating by text hash.
 */
export function addSharedRule(
  rule: { text: string; category: string },
  sourceProject: string
): SharedRule {
  const store = readSharedRules();
  const id = contentHash(rule.text);

  // Check for existing rule with same ID (exact duplicate)
  const existing = store.rules.find((r) => r.id === id);
  if (existing) {
    return existing;
  }

  // Check for semantic duplicate via Jaccard similarity
  const newTokens = tokenize(rule.text);
  for (const existingRule of store.rules) {
    const existingTokens = tokenize(existingRule.text);
    if (jaccardSimilarity(newTokens, existingTokens) > SIMILARITY_THRESHOLD) {
      return existingRule;
    }
  }

  const sharedRule: SharedRule = {
    id,
    text: rule.text,
    category: rule.category,
    sourceProject,
    addedAt: Date.now(),
  };

  store.rules.push(sharedRule);
  writeSharedRules(store);
  return sharedRule;
}

/**
 * Remove a shared rule by its ID.
 */
export function removeSharedRule(ruleId: string): boolean {
  const store = readSharedRules();
  const idx = store.rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return false;

  store.rules.splice(idx, 1);
  writeSharedRules(store);
  return true;
}

/**
 * List all shared rules.
 */
export function listSharedRules(): SharedRule[] {
  return readSharedRules().rules;
}

/**
 * Sync shared rules INTO a project's CLAUDE.md.
 * Skips rules that already exist (using Jaccard > 0.7 to detect).
 */
export function syncToProject(cwd: string): { added: string[]; skipped: string[] } {
  const store = readSharedRules();
  const added: string[] = [];
  const skipped: string[] = [];

  if (store.rules.length === 0) {
    return { added, skipped };
  }

  // Find the project's CLAUDE.md
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];
  const claudeMdPath = candidates.find((p) => existsSync(p));

  if (!claudeMdPath) {
    // No CLAUDE.md — create one at CLAUDE.md with all shared rules
    const lines: string[] = ['# Project Instructions', ''];
    const byCategory = new Map<string, string[]>();

    for (const rule of store.rules) {
      const cat = rule.category || 'General';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(rule.text);
    }

    for (const [category, rules] of byCategory) {
      lines.push(`## ${category}`, '');
      for (const ruleText of rules) {
        lines.push(`- ${ruleText}`);
      }
      lines.push('');
    }

    const targetPath = join(cwd, 'CLAUDE.md');
    writeFileSync(targetPath, lines.join('\n').trim() + '\n', 'utf-8');
    added.push(...store.rules.map((r) => r.text));

    store.lastSynced[cwd] = Date.now();
    writeSharedRules(store);

    return { added, skipped };
  }

  // Parse existing CLAUDE.md
  const content = readFileSync(claudeMdPath, 'utf-8');
  const doc = parseClaudeMd(claudeMdPath, content);
  const existingRules = getAllRules(doc);
  const existingTokenSets = existingRules.map((r) => tokenize(r.text));

  let updatedDoc = doc;

  for (const sharedRule of store.rules) {
    const sharedTokens = tokenize(sharedRule.text);

    // Check if a similar rule already exists
    const alreadyPresent = existingTokenSets.some(
      (tokens) => jaccardSimilarity(sharedTokens, tokens) > SIMILARITY_THRESHOLD
    );

    if (alreadyPresent) {
      skipped.push(sharedRule.text);
    } else {
      const sectionHeading = sharedRule.category || 'Shared Rules';
      updatedDoc = addRuleToSection(updatedDoc, sectionHeading, sharedRule.text);
      added.push(sharedRule.text);
      existingTokenSets.push(sharedTokens);
    }
  }

  // Write updated CLAUDE.md if changes were made
  if (added.length > 0) {
    const output = writeClaudeMd(updatedDoc);
    writeFileSync(claudeMdPath, output, 'utf-8');
  }

  // Update lastSynced
  store.lastSynced[cwd] = Date.now();
  writeSharedRules(store);

  return { added, skipped };
}

/**
 * Promote a local rule from a project's CLAUDE.md to the shared global store.
 */
export function promoteRule(ruleText: string, cwd: string): SharedRule {
  const category = categorizeRuleText(ruleText);
  return addSharedRule({ text: ruleText, category }, cwd);
}
