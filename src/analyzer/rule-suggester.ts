// ============================================================
// claudemd-lint — Rule Suggester
// ============================================================

import { randomUUID } from 'node:crypto';
import type { RuleSuggestion, CorrectionCategory, PluginConfig } from '../types.js';
import type { CorrectionGroup } from './correction-aggregator.js';
import { getFrequentGroups } from './correction-aggregator.js';
import { readConfig, readSuggestions, writeSuggestions } from '../analytics/storage.js';

/**
 * Map correction categories to target CLAUDE.md sections.
 */
function targetSectionForCategory(category: CorrectionCategory): string {
  switch (category) {
    case 'style':
      return 'Code Style';
    case 'tool':
      return 'Tool Preferences';
    case 'convention':
      return 'Conventions';
    case 'behavior':
      return 'Behavior Rules';
    case 'structure':
      return 'Project Structure';
    case 'language':
      return 'Communication';
    case 'general':
    default:
      return 'General Rules';
  }
}

/**
 * Determine which CLAUDE.md file a rule should be added to.
 * Project-specific corrections go to the project CLAUDE.md,
 * generic ones go to the global CLAUDE.md.
 */
function targetFileForGroup(group: CorrectionGroup, cwd: string): string {
  // If corrections reference project-specific terms, target project file
  const projectIndicators = [
    'this project', 'this repo', 'this codebase', 'here',
    'our', 'in this',
  ];

  const text = group.representativeRule.toLowerCase();
  const isProjectSpecific = projectIndicators.some((ind) => text.includes(ind));

  if (isProjectSpecific) {
    return `${cwd}/CLAUDE.md`;
  }

  // Default to project-level CLAUDE.md (safer than global)
  return `${cwd}/CLAUDE.md`;
}

/**
 * Clean up extracted rule text into a proper directive.
 */
function cleanRuleText(text: string): string {
  let rule = text.trim();

  // Capitalize first letter
  if (rule.length > 0) {
    rule = rule.charAt(0).toUpperCase() + rule.slice(1);
  }

  // Ensure it ends with a period
  if (rule && !/[.!?]$/.test(rule)) {
    rule += '.';
  }

  // Remove trailing "please", "ok", etc.
  rule = rule.replace(/\s+(please|ok|okay|thanks|thank you)[.!?]?$/i, '.');

  return rule;
}

/**
 * Calculate confidence for a suggestion based on group properties.
 */
function calculateConfidence(group: CorrectionGroup): number {
  let confidence = 0;

  // Base: average confidence of source corrections
  const avgConfidence =
    group.corrections.reduce((sum, c) => sum + c.confidence, 0) /
    group.corrections.length;
  confidence += avgConfidence * 0.5;

  // Frequency bonus: more occurrences = higher confidence
  const freqBonus = Math.min(group.occurrences / 10, 0.3);
  confidence += freqBonus;

  // Consistency bonus: if corrections are from different sessions
  const uniqueSessions = new Set(group.corrections.map((c) => c.sessionId));
  if (uniqueSessions.size > 1) {
    confidence += 0.1;
  }

  // Category bonus: explicit directives are more reliable
  if (['convention', 'style', 'tool'].includes(group.category)) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Generate rule suggestions from correction groups.
 * Only groups meeting the minimum occurrence threshold are included.
 */
export function generateSuggestions(
  groups: CorrectionGroup[],
  cwd: string,
  threshold: number = 3
): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];

  for (const group of groups) {
    // Skip groups below the occurrence threshold
    // Use corrections.length as fallback if occurrences is not set
    const count = group.occurrences ?? group.corrections.length;
    if (count < threshold) continue;
    const ruleText = cleanRuleText(group.representativeRule);

    // Skip if rule text is too vague
    if (ruleText.length < 10) continue;
    if (ruleText === 'Correction detected (review context).') continue;

    suggestions.push({
      id: randomUUID(),
      createdAt: Date.now(),
      ruleText,
      targetFile: targetFileForGroup(group, cwd),
      targetSection: targetSectionForCategory(group.category),
      sourceCorrections: group.corrections.map((c) => c.id),
      occurrences: group.occurrences,
      confidence: calculateConfidence(group),
      status: 'pending',
    });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Run the full suggestion pipeline: aggregate corrections, generate suggestions,
 * merge with existing suggestions (avoiding duplicates), and save.
 */
export function runSuggestionPipeline(cwd: string): RuleSuggestion[] {
  const config = readConfig(cwd);
  const groups = getFrequentGroups(cwd, config.correctionThreshold);

  if (groups.length === 0) return [];

  const newSuggestions = generateSuggestions(groups, cwd);
  if (newSuggestions.length === 0) return [];

  // Merge with existing suggestions, avoiding duplicates
  const existing = readSuggestions(cwd);
  const existingRules = new Set(
    existing.map((s) => s.ruleText.toLowerCase().trim())
  );

  const merged = [...existing];
  const added: RuleSuggestion[] = [];

  for (const suggestion of newSuggestions) {
    const normalized = suggestion.ruleText.toLowerCase().trim();
    if (!existingRules.has(normalized)) {
      merged.push(suggestion);
      added.push(suggestion);
      existingRules.add(normalized);
    }
  }

  if (added.length > 0) {
    writeSuggestions(cwd, merged);
  }

  return added;
}
