// ============================================================
// claudemd-lint — Backup Manager
// ============================================================

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  copyFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { parseClaudeMd, getAllRules } from '../parser/claudemd-parser.js';
import type { BackupEntry } from '../types.js';

const STORAGE_DIR = '.claudemd-lint';
const BACKUPS_DIR = 'backups';
const MANIFEST_FILE = 'backups.json';
const MAX_BACKUPS = 10;

// --- Internal Helpers ---

function getBackupsDir(cwd: string): string {
  return join(cwd, STORAGE_DIR, BACKUPS_DIR);
}

function getManifestPath(cwd: string): string {
  return join(getBackupsDir(cwd), MANIFEST_FILE);
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

function readManifest(cwd: string): BackupEntry[] {
  return readJson<BackupEntry[]>(getManifestPath(cwd), []);
}

function writeManifest(cwd: string, entries: BackupEntry[]): void {
  writeJson(getManifestPath(cwd), entries);
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, '');
}

function countRules(content: string, filePath: string): number {
  try {
    const doc = parseClaudeMd(filePath, content);
    return getAllRules(doc).length;
  } catch {
    return 0;
  }
}

// --- Public API ---

/**
 * Create a timestamped backup of a CLAUDE.md file.
 */
export function createBackup(
  cwd: string,
  claudeMdPath: string
): BackupEntry {
  const backupsDir = getBackupsDir(cwd);
  ensureDir(backupsDir);

  const fullPath = claudeMdPath.startsWith('/')
    ? claudeMdPath
    : join(cwd, claudeMdPath);

  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  const stat = statSync(fullPath);
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const backupFileName = `CLAUDE.md.${timestamp}.bak`;
  const backupPath = join(backupsDir, backupFileName);

  copyFileSync(fullPath, backupPath);

  const entry: BackupEntry = {
    id: timestamp,
    timestamp: now.getTime(),
    filePath: fullPath,
    backupPath,
    fileSize: stat.size,
    ruleCount: countRules(content, fullPath),
  };

  const manifest = readManifest(cwd);
  manifest.push(entry);
  writeManifest(cwd, manifest);

  // Auto-cleanup after creating
  autoCleanupBackups(cwd);

  return entry;
}

/**
 * List all available backups with metadata, sorted by timestamp descending.
 */
export function listBackups(cwd: string): BackupEntry[] {
  const manifest = readManifest(cwd);

  // Filter out entries whose backup files no longer exist
  const valid = manifest.filter((entry) => existsSync(entry.backupPath));

  // Update manifest if some entries were removed
  if (valid.length !== manifest.length) {
    writeManifest(cwd, valid);
  }

  // Sort newest first
  return valid.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Restore a CLAUDE.md from a specific backup by its ID.
 */
export function restoreBackup(
  cwd: string,
  backupId: string
): { success: boolean; restoredFrom: string; restoredTo: string } {
  const manifest = readManifest(cwd);
  const entry = manifest.find((e) => e.id === backupId);

  if (!entry) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  if (!existsSync(entry.backupPath)) {
    throw new Error(`Backup file missing: ${entry.backupPath}`);
  }

  // Overwrite the original CLAUDE.md with the backup content
  copyFileSync(entry.backupPath, entry.filePath);

  return {
    success: true,
    restoredFrom: entry.backupPath,
    restoredTo: entry.filePath,
  };
}

/**
 * Auto-cleanup: keep only the most recent MAX_BACKUPS entries.
 * Deletes oldest backup files and manifest entries when exceeded.
 */
export function autoCleanupBackups(cwd: string): number {
  const manifest = readManifest(cwd);

  if (manifest.length <= MAX_BACKUPS) {
    return 0;
  }

  // Sort by timestamp ascending (oldest first)
  manifest.sort((a, b) => a.timestamp - b.timestamp);

  const toRemove = manifest.splice(0, manifest.length - MAX_BACKUPS);

  for (const entry of toRemove) {
    try {
      if (existsSync(entry.backupPath)) {
        unlinkSync(entry.backupPath);
      }
    } catch {
      // Ignore deletion errors for individual files
    }
  }

  writeManifest(cwd, manifest);
  return toRemove.length;
}
