// ============================================================
// claudemd-lint — Session Transcript Reader
// ============================================================

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  toolName?: string;
}

export interface SessionTranscript {
  sessionId: string;
  filePath: string;
  messages: TranscriptMessage[];
}

/**
 * Get the base directory for Claude Code session transcripts.
 */
function getProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

/**
 * Parse a single JSONL transcript file.
 * Each line is a JSON object representing a conversation event.
 */
export function parseTranscriptFile(filePath: string): TranscriptMessage[] {
  if (!existsSync(filePath)) return [];

  const messages: TranscriptMessage[] = [];
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l: string) => l.trim());

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Handle different transcript formats
      if (entry.type === 'human' || entry.role === 'user') {
        const content = extractContent(entry);
        if (content) {
          messages.push({
            role: 'user',
            content,
            timestamp: entry.timestamp ?? entry.ts,
          });
        }
      } else if (entry.type === 'assistant' || entry.role === 'assistant') {
        const content = extractContent(entry);
        if (content) {
          messages.push({
            role: 'assistant',
            content,
            timestamp: entry.timestamp ?? entry.ts,
            toolName: entry.tool_name ?? entry.toolName,
          });
        }
      } else if (entry.type === 'system' || entry.role === 'system') {
        const content = extractContent(entry);
        if (content) {
          messages.push({
            role: 'system',
            content,
            timestamp: entry.timestamp ?? entry.ts,
          });
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

/**
 * Extract text content from various message formats.
 */
function extractContent(entry: Record<string, unknown>): string {
  // Direct content string
  if (typeof entry.content === 'string') {
    return entry.content;
  }

  // Content as array of parts
  if (Array.isArray(entry.content)) {
    return (entry.content as Array<Record<string, unknown>>)
      .filter((p) => p.type === 'text')
      .map((p) => String(p.text ?? ''))
      .join(' ');
  }

  // Message wrapper
  if (entry.message && typeof entry.message === 'object') {
    const msg = entry.message as Record<string, unknown>;
    if (typeof msg.content === 'string') return msg.content;
  }

  // Prompt field
  if (typeof entry.prompt === 'string') {
    return entry.prompt;
  }

  // Parts array
  if (Array.isArray(entry.parts)) {
    return (entry.parts as Array<Record<string, unknown>>)
      .filter((p) => p.type === 'text')
      .map((p) => String(p.text ?? ''))
      .join(' ');
  }

  return '';
}

/**
 * Read a specific session transcript by session ID.
 * Searches across all project directories.
 */
export function readSessionTranscript(sessionId: string): SessionTranscript | null {
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) return null;

  try {
    const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(projectsDir, d.name));

    for (const dir of projectDirs) {
      const filePath = join(dir, `${sessionId}.jsonl`);
      if (existsSync(filePath)) {
        return {
          sessionId,
          filePath,
          messages: parseTranscriptFile(filePath),
        };
      }
    }
  } catch {
    // Ignore filesystem errors
  }

  return null;
}

/**
 * List all available session transcript files.
 * Returns session IDs sorted by modification time (newest first).
 */
export function listSessionIds(): string[] {
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const sessions: Array<{ id: string; mtime: number }> = [];

  try {
    const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(projectsDir, d.name));

    for (const dir of projectDirs) {
      try {
        const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = join(dir, file);
          const id = basename(file, '.jsonl');
          try {
            const { mtimeMs } = statSync(filePath);
            sessions.push({ id, mtime: mtimeMs });
          } catch {
            sessions.push({ id, mtime: 0 });
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
  } catch {
    // Ignore filesystem errors
  }

  return sessions
    .sort((a, b) => b.mtime - a.mtime)
    .map((s) => s.id);
}

/**
 * Extract only user messages from a session transcript.
 */
export function getUserMessages(transcript: SessionTranscript): TranscriptMessage[] {
  return transcript.messages.filter((m) => m.role === 'user');
}
