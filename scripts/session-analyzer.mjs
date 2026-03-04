#!/usr/bin/env node
/**
 * Stop hook — Analyze corrections from the session and generate suggestions.
 *
 * Reads corrections, groups by topic using keyword overlap,
 * and generates rule suggestions for frequently corrected topics.
 */

import { readStdin, createHookOutput, getStorageDir } from './lib/stdin.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

// --- Stop words for keyword extraction ---
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'or', 'and', 'but', 'not', 'no', 'do',
  'does', 'did', 'be', 'am', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can',
  'this', 'that', 'i', 'you', 'me', 'my', 'your', 'we', 'they',
  'use', 'using', 'don', 'dont', 'always', 'never', 'make', 'sure',
  'please', 'stop', 'keep', 'want',
]);

// --- Storage helpers ---

function readJson(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Keyword extraction ---

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function extractKeywords(tokens, df, totalDocs) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  const scored = [];
  for (const [term, freq] of tf) {
    const idf = Math.log(totalDocs / (df.get(term) ?? 1));
    scored.push({ term, score: freq * idf });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 5).map((s) => s.term);
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const item of setA) if (setB.has(item)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// --- Grouping ---

function groupCorrections(corrections, threshold = 0.3) {
  if (corrections.length === 0) return [];

  const tokenized = corrections.map((c) => tokenize(c.extractedRule));
  const df = new Map();
  for (const tokens of tokenized) {
    const unique = new Set(tokens);
    for (const t of unique) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const keywords = tokenized.map((t) => extractKeywords(t, df, corrections.length));
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < corrections.length; i++) {
    if (assigned.has(i)) continue;

    const group = {
      category: corrections[i].category,
      corrections: [corrections[i]],
      occurrences: 1,
      representativeRule: corrections[i].extractedRule,
    };
    assigned.add(i);

    for (let j = i + 1; j < corrections.length; j++) {
      if (assigned.has(j)) continue;
      if (jaccardSimilarity(keywords[i], keywords[j]) >= threshold) {
        group.corrections.push(corrections[j]);
        group.occurrences++;
        assigned.add(j);
      }
    }

    // Pick most common phrasing
    if (group.corrections.length > 1) {
      const counts = new Map();
      for (const c of group.corrections) {
        const key = c.extractedRule.toLowerCase().trim();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let best = group.corrections[0].extractedRule;
      let bestCount = 0;
      for (const c of group.corrections) {
        const count = counts.get(c.extractedRule.toLowerCase().trim()) ?? 0;
        if (count > bestCount) {
          bestCount = count;
          best = c.extractedRule;
        }
      }
      group.representativeRule = best;
    }

    groups.push(group);
  }

  return groups.sort((a, b) => b.occurrences - a.occurrences);
}

// --- Section mapping ---

function targetSection(category) {
  const map = {
    style: 'Code Style',
    tool: 'Tool Preferences',
    convention: 'Conventions',
    behavior: 'Behavior Rules',
    structure: 'Project Structure',
    language: 'Communication',
    general: 'General Rules',
  };
  return map[category] ?? 'General Rules';
}

function cleanRule(text) {
  let r = text.trim();
  if (r.length > 0) r = r.charAt(0).toUpperCase() + r.slice(1);
  if (r && !/[.!?]$/.test(r)) r += '.';
  r = r.replace(/\s+(please|ok|okay|thanks|thank you)[.!?]?$/i, '.');
  return r;
}

// --- Main ---

async function main() {
  const raw = await readStdin();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(JSON.stringify(createHookOutput('Stop')));
    return;
  }

  const cwd = parsed.cwd || parsed.directory || process.cwd();
  const storageDir = getStorageDir(cwd);
  const correctionsPath = join(storageDir, 'corrections.json');
  const suggestionsPath = join(storageDir, 'suggestions.json');
  const configPath = join(storageDir, 'config.json');

  const corrections = readJson(correctionsPath, []);
  if (corrections.length === 0) {
    console.log(JSON.stringify(createHookOutput('Stop')));
    return;
  }

  const config = readJson(configPath, { correctionThreshold: 3 });
  const minOccurrences = config.correctionThreshold ?? 3;

  // Group and filter
  const groups = groupCorrections(corrections);
  const frequent = groups.filter((g) => g.occurrences >= minOccurrences);

  if (frequent.length === 0) {
    console.log(JSON.stringify(createHookOutput('Stop')));
    return;
  }

  // Generate suggestions
  const existingSuggestions = readJson(suggestionsPath, []);
  const existingRules = new Set(
    existingSuggestions.map((s) => s.ruleText.toLowerCase().trim())
  );

  const newSuggestions = [];

  for (const group of frequent) {
    const ruleText = cleanRule(group.representativeRule);
    if (ruleText.length < 10) continue;

    const normalized = ruleText.toLowerCase().trim();
    if (existingRules.has(normalized)) continue;

    // Calculate confidence
    const avgConf =
      group.corrections.reduce((s, c) => s + c.confidence, 0) /
      group.corrections.length;
    const freqBonus = Math.min(group.occurrences / 10, 0.3);
    const sessionBonus =
      new Set(group.corrections.map((c) => c.sessionId)).size > 1 ? 0.1 : 0;
    const catBonus = ['convention', 'style', 'tool'].includes(group.category) ? 0.1 : 0;
    const confidence = Math.min(avgConf * 0.5 + freqBonus + sessionBonus + catBonus, 1.0);

    newSuggestions.push({
      id: randomUUID(),
      createdAt: Date.now(),
      ruleText,
      targetFile: `${cwd}/CLAUDE.md`,
      targetSection: targetSection(group.category),
      sourceCorrections: group.corrections.map((c) => c.id),
      occurrences: group.occurrences,
      confidence,
      status: 'pending',
    });

    existingRules.add(normalized);
  }

  if (newSuggestions.length > 0) {
    const merged = [...existingSuggestions, ...newSuggestions];
    writeJson(suggestionsPath, merged);
  }

  // Build session summary message
  const messageParts = [];

  if (newSuggestions.length > 0) {
    messageParts.push(
      `${newSuggestions.length} new rule suggestion${newSuggestions.length > 1 ? 's' : ''} generated from repeated corrections.`,
      `Run /claudemd-suggest to review them.`
    );
  }

  // Suggest LLM-based detection only when regex found some corrections
  // but not enough to generate suggestions (likely missed nuanced corrections)
  if (corrections.length > 0 && corrections.length < minOccurrences) {
    messageParts.push(
      `Detected ${corrections.length} correction${corrections.length > 1 ? 's' : ''} but not enough for auto-suggestion yet.`,
      `Run /claudemd-detect for deeper LLM-based analysis — catches corrections that regex can't.`
    );
  }

  if (messageParts.length > 0) {
    const message = ['<claudemd-lint>', ...messageParts, '</claudemd-lint>'].join('\n');
    console.log(JSON.stringify(createHookOutput('Stop', message)));
  } else {
    console.log(JSON.stringify(createHookOutput('Stop')));
  }
}

try {
  await main();
} catch {
  console.log(JSON.stringify({ continue: true }));
}
