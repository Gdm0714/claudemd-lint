import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Correction,
  RuleSuggestion,
  AnalyticsData,
  PluginConfig,
  DEFAULT_CONFIG,
} from '../types.js';

const STORAGE_DIR = '.claudemd-lint';

function getStoragePath(cwd: string): string {
  return join(cwd, STORAGE_DIR);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, data: T): void {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  ensureDir(dir);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Corrections ---

export function readCorrections(cwd: string): Correction[] {
  return readJson(join(getStoragePath(cwd), 'corrections.json'), []);
}

export function writeCorrections(cwd: string, corrections: Correction[]): void {
  writeJson(join(getStoragePath(cwd), 'corrections.json'), corrections);
}

export function appendCorrection(cwd: string, correction: Correction): void {
  const corrections = readCorrections(cwd);
  corrections.push(correction);
  writeCorrections(cwd, corrections);
}

// --- Suggestions ---

export function readSuggestions(cwd: string): RuleSuggestion[] {
  return readJson(join(getStoragePath(cwd), 'suggestions.json'), []);
}

export function writeSuggestions(cwd: string, suggestions: RuleSuggestion[]): void {
  writeJson(join(getStoragePath(cwd), 'suggestions.json'), suggestions);
}

export function getPendingSuggestions(cwd: string): RuleSuggestion[] {
  return readSuggestions(cwd).filter((s) => s.status === 'pending');
}

export function updateSuggestionStatus(
  cwd: string,
  suggestionId: string,
  status: 'accepted' | 'dismissed',
  dismissReason?: string
): void {
  const suggestions = readSuggestions(cwd);
  const idx = suggestions.findIndex((s) => s.id === suggestionId);
  if (idx !== -1) {
    suggestions[idx].status = status;
    if (dismissReason) suggestions[idx].dismissReason = dismissReason;
    writeSuggestions(cwd, suggestions);
  }
}

// --- Analytics ---

const EMPTY_ANALYTICS: AnalyticsData = {
  rules: {},
  sessions: [],
  totalSessions: 0,
};

export function readAnalytics(cwd: string): AnalyticsData {
  return readJson(join(getStoragePath(cwd), 'analytics.json'), EMPTY_ANALYTICS);
}

export function writeAnalytics(cwd: string, analytics: AnalyticsData): void {
  writeJson(join(getStoragePath(cwd), 'analytics.json'), analytics);
}

// --- Config ---

const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  correctionThreshold: 3,
  similarityThreshold: 0.7,
  staleSessions: 20,
  autoDetect: true,
};

export function readConfig(cwd: string): PluginConfig {
  return readJson(join(getStoragePath(cwd), 'config.json'), DEFAULT_PLUGIN_CONFIG);
}

export function writeConfig(cwd: string, config: PluginConfig): void {
  writeJson(join(getStoragePath(cwd), 'config.json'), config);
}

// --- Utility ---

export function storageExists(cwd: string): boolean {
  return existsSync(getStoragePath(cwd));
}

export function initStorage(cwd: string): void {
  const dir = getStoragePath(cwd);
  ensureDir(dir);
  if (!existsSync(join(dir, 'config.json'))) {
    writeConfig(cwd, DEFAULT_PLUGIN_CONFIG);
  }
}
