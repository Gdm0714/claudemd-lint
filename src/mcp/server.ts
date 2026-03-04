// ============================================================
// claudemd-lint — MCP Server
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  getPendingSuggestions,
  readSuggestions,
  updateSuggestionStatus,
  readAnalytics,
  readConfig,
} from '../analytics/storage.js';
import { parseClaudeMd, getAllRules } from '../parser/claudemd-parser.js';
import { findDuplicates } from '../parser/dedup-engine.js';
import {
  createBackup,
  listBackups,
} from '../backup/backup-manager.js';
import { calculateHealth } from '../analytics/health-scorer.js';
import { syncToProject, promoteRule } from '../sync/shared-rules.js';
import type { RuleAnalytics } from '../types.js';

// --- Zod Schemas for Tool Parameters ---

const GetSuggestionsSchema = z.object({
  cwd: z.string().optional(),
});

const GetStatsSchema = z.object({
  cwd: z.string().optional(),
});

const GetStaleRulesSchema = z.object({
  cwd: z.string().optional(),
  threshold: z.number().optional(),
});

const GetDuplicatesSchema = z.object({
  cwd: z.string(),
});

const ApplySuggestionSchema = z.object({
  cwd: z.string(),
  suggestionId: z.string(),
});

const DismissSuggestionSchema = z.object({
  cwd: z.string(),
  suggestionId: z.string(),
  reason: z.string().optional(),
});

const CreateBackupSchema = z.object({
  cwd: z.string(),
});

const ListBackupsSchema = z.object({
  cwd: z.string().optional(),
});

const GetHealthSchema = z.object({
  cwd: z.string().optional(),
});

const SyncRulesSchema = z.object({
  cwd: z.string(),
});

const PromoteRuleSchema = z.object({
  cwd: z.string(),
  ruleText: z.string(),
});

// --- Zod to JSON Schema Converter ---

type JsonSchema = Record<string, unknown>;

function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodTypeAny;
      if (zodValue instanceof z.ZodOptional) {
        properties[key] = zodToJsonSchema(zodValue.unwrap());
      } else {
        properties[key] = zodToJsonSchema(zodValue);
        required.push(key);
      }
    }

    const result: JsonSchema = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    return result;
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  return { type: 'string' };
}

// --- Tool Definitions ---

const TOOLS = [
  {
    name: 'claudemd_get_suggestions',
    description:
      'Get pending rule suggestions based on detected correction patterns. Returns suggestions that have not yet been accepted or dismissed.',
    inputSchema: zodToJsonSchema(GetSuggestionsSchema),
  },
  {
    name: 'claudemd_get_stats',
    description:
      'Get analytics dashboard data showing rule usage statistics, session history, and overall CLAUDE.md effectiveness metrics.',
    inputSchema: zodToJsonSchema(GetStatsSchema),
  },
  {
    name: 'claudemd_get_stale_rules',
    description:
      'Find rules that have not been referenced in recent sessions, indicating they may be outdated or unnecessary. Threshold defaults to the configured staleSessions value.',
    inputSchema: zodToJsonSchema(GetStaleRulesSchema),
  },
  {
    name: 'claudemd_get_duplicates',
    description:
      'Parse CLAUDE.md files and detect duplicate rules, conflicting directives, and misplaced rules. Returns a comprehensive dedup report.',
    inputSchema: zodToJsonSchema(GetDuplicatesSchema),
  },
  {
    name: 'claudemd_apply_suggestion',
    description:
      'Mark a pending rule suggestion as accepted. The suggestion ID can be obtained from claudemd_get_suggestions.',
    inputSchema: zodToJsonSchema(ApplySuggestionSchema),
  },
  {
    name: 'claudemd_dismiss_suggestion',
    description:
      'Mark a pending rule suggestion as dismissed with an optional reason. Dismissed suggestions will not appear in future suggestion lists.',
    inputSchema: zodToJsonSchema(DismissSuggestionSchema),
  },
  {
    name: 'claudemd_create_backup',
    description:
      'Create a backup of CLAUDE.md before making changes. Stores a timestamped copy in .claudemd-lint/backups/ and returns the backup metadata.',
    inputSchema: zodToJsonSchema(CreateBackupSchema),
  },
  {
    name: 'claudemd_list_backups',
    description:
      'List available CLAUDE.md backups with metadata including timestamp, file size, and rule count. Returns backups sorted by most recent first.',
    inputSchema: zodToJsonSchema(ListBackupsSchema),
  },
  {
    name: 'claudemd_get_health',
    description:
      'Get CLAUDE.md health score (0-100) with factor breakdown and recommendations. Evaluates duplicate ratio, stale rules, section structure, rule count balance, conflicts, and correction conversion rate.',
    inputSchema: zodToJsonSchema(GetHealthSchema),
  },
  {
    name: 'claudemd_sync_rules',
    description:
      'Sync shared global rules into this project\'s CLAUDE.md. Pulls rules from ~/.claude/shared-rules.json and adds missing ones, skipping duplicates detected via Jaccard similarity > 0.7.',
    inputSchema: zodToJsonSchema(SyncRulesSchema),
  },
  {
    name: 'claudemd_promote_rule',
    description:
      'Promote a local rule to the shared global rule store at ~/.claude/shared-rules.json. The rule is auto-categorized and deduplicated before adding.',
    inputSchema: zodToJsonSchema(PromoteRuleSchema),
  },
] as const;

// --- Tool Handlers ---

function resolveCwd(args: { cwd?: string }): string {
  return args.cwd || process.cwd();
}

function jsonResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function handleGetSuggestions(args: unknown) {
  const parsed = GetSuggestionsSchema.parse(args);
  const cwd = resolveCwd(parsed);
  const suggestions = getPendingSuggestions(cwd);

  return jsonResult({
    count: suggestions.length,
    suggestions: suggestions.map((s) => ({
      id: s.id,
      ruleText: s.ruleText,
      targetFile: s.targetFile,
      targetSection: s.targetSection,
      occurrences: s.occurrences,
      confidence: s.confidence,
      sourceCorrections: s.sourceCorrections.length,
    })),
  });
}

function handleGetStats(args: unknown) {
  const parsed = GetStatsSchema.parse(args);
  const cwd = resolveCwd(parsed);
  const analytics = readAnalytics(cwd);
  const suggestions = readSuggestions(cwd);
  const config = readConfig(cwd);

  const ruleEntries = Object.values(analytics.rules);
  const totalRules = ruleEntries.length;
  const activeRules = ruleEntries.filter(
    (r) => analytics.totalSessions - getLastSessionIndex(analytics, r) < config.staleSessions
  ).length;

  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending').length;
  const acceptedSuggestions = suggestions.filter((s) => s.status === 'accepted').length;
  const dismissedSuggestions = suggestions.filter((s) => s.status === 'dismissed').length;

  return jsonResult({
    totalRules,
    activeRules,
    staleRules: totalRules - activeRules,
    totalSessions: analytics.totalSessions,
    recentSessions: analytics.sessions.slice(-10).map((s) => ({
      sessionId: s.sessionId,
      timestamp: new Date(s.timestamp).toISOString(),
      correctionsDetected: s.correctionsDetected,
      rulesReferenced: s.rulesReferenced,
    })),
    suggestions: {
      pending: pendingSuggestions,
      accepted: acceptedSuggestions,
      dismissed: dismissedSuggestions,
    },
  });
}

function getLastSessionIndex(analytics: { sessions: Array<{ sessionId: string }> }, rule: RuleAnalytics): number {
  for (let i = analytics.sessions.length - 1; i >= 0; i--) {
    if (rule.sessionsReferenced.includes(analytics.sessions[i].sessionId)) {
      return i;
    }
  }
  return 0;
}

function handleGetStaleRules(args: unknown) {
  const parsed = GetStaleRulesSchema.parse(args);
  const cwd = resolveCwd(parsed);
  const analytics = readAnalytics(cwd);
  const config = readConfig(cwd);
  const threshold = parsed.threshold ?? config.staleSessions;

  const ruleEntries = Object.values(analytics.rules);
  const staleRules = ruleEntries.filter((rule) => {
    const lastIndex = getLastSessionIndex(analytics, rule);
    return analytics.totalSessions - lastIndex >= threshold;
  });

  return jsonResult({
    threshold,
    totalSessions: analytics.totalSessions,
    staleCount: staleRules.length,
    staleRules: staleRules.map((r) => ({
      ruleId: r.ruleId,
      ruleText: r.ruleText,
      totalReferences: r.totalReferences,
      lastReferenced: r.lastReferenced ? new Date(r.lastReferenced).toISOString() : 'never',
      sessionsReferenced: r.sessionsReferenced.length,
    })),
  });
}

function handleGetDuplicates(args: unknown) {
  const parsed = GetDuplicatesSchema.parse(args);
  const cwd = parsed.cwd;

  // Find CLAUDE.md files
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];

  const results: Array<{ file: string; report: ReturnType<typeof findDuplicates> }> = [];

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const doc = parseClaudeMd(filePath, content);
        const report = findDuplicates(doc);
        results.push({ file: filePath, report });
      } catch (err) {
        console.error(`Error parsing ${filePath}:`, err);
      }
    }
  }

  return jsonResult({
    filesAnalyzed: results.length,
    results: results.map(({ file, report }) => ({
      file,
      duplicates: report.duplicates.map((d) => ({
        ruleA: d.ruleA.text,
        ruleB: d.ruleB.text,
        similarity: Math.round(d.similarity * 100) + '%',
        type: d.type,
      })),
      conflicts: report.conflicts.map((c) => ({
        ruleA: c.ruleA.text,
        ruleB: c.ruleB.text,
        reason: c.reason,
      })),
      misplaced: report.misplaced.map((m) => ({
        rule: m.rule.text,
        currentSection: m.currentSection,
        suggestedSection: m.suggestedSection,
      })),
    })),
  });
}

function handleApplySuggestion(args: unknown) {
  const parsed = ApplySuggestionSchema.parse(args);
  const cwd = parsed.cwd;

  const before = readSuggestions(cwd);
  const target = before.find((s) => s.id === parsed.suggestionId);

  if (!target) {
    return jsonResult({ success: false, error: `Suggestion "${parsed.suggestionId}" not found` });
  }

  if (target.status !== 'pending') {
    return jsonResult({
      success: false,
      error: `Suggestion "${parsed.suggestionId}" is already ${target.status}`,
    });
  }

  updateSuggestionStatus(cwd, parsed.suggestionId, 'accepted');

  return jsonResult({
    success: true,
    suggestion: {
      id: target.id,
      ruleText: target.ruleText,
      targetFile: target.targetFile,
      targetSection: target.targetSection,
      status: 'accepted',
    },
  });
}

function handleDismissSuggestion(args: unknown) {
  const parsed = DismissSuggestionSchema.parse(args);
  const cwd = parsed.cwd;

  const before = readSuggestions(cwd);
  const target = before.find((s) => s.id === parsed.suggestionId);

  if (!target) {
    return jsonResult({ success: false, error: `Suggestion "${parsed.suggestionId}" not found` });
  }

  if (target.status !== 'pending') {
    return jsonResult({
      success: false,
      error: `Suggestion "${parsed.suggestionId}" is already ${target.status}`,
    });
  }

  updateSuggestionStatus(cwd, parsed.suggestionId, 'dismissed', parsed.reason);

  return jsonResult({
    success: true,
    suggestion: {
      id: target.id,
      ruleText: target.ruleText,
      status: 'dismissed',
      dismissReason: parsed.reason ?? null,
    },
  });
}

function handleCreateBackup(args: unknown) {
  const parsed = CreateBackupSchema.parse(args);
  const cwd = parsed.cwd;

  // Find the CLAUDE.md file
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];

  const claudeMdPath = candidates.find((p) => existsSync(p));

  if (!claudeMdPath) {
    return jsonResult({
      success: false,
      error: 'No CLAUDE.md file found in project',
    });
  }

  try {
    const entry = createBackup(cwd, claudeMdPath);
    return jsonResult({
      success: true,
      backupId: entry.id,
      backupPath: entry.backupPath,
      ruleCount: entry.ruleCount,
      fileSize: entry.fileSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResult({ success: false, error: message });
  }
}

function handleListBackups(args: unknown) {
  const parsed = ListBackupsSchema.parse(args);
  const cwd = resolveCwd(parsed);
  const backups = listBackups(cwd);

  return jsonResult({
    count: backups.length,
    backups: backups.map((b) => ({
      id: b.id,
      timestamp: new Date(b.timestamp).toISOString(),
      filePath: b.filePath,
      backupPath: b.backupPath,
      fileSize: b.fileSize,
      ruleCount: b.ruleCount,
    })),
  });
}

function handleGetHealth(args: unknown) {
  const parsed = GetHealthSchema.parse(args);
  const cwd = resolveCwd(parsed);
  const report = calculateHealth(cwd);

  return jsonResult({
    score: report.score,
    grade: report.grade,
    factors: report.factors.map((f) => ({
      name: f.name,
      score: f.score,
      weight: f.weight,
      weighted: Math.round(f.score * f.weight * 10) / 10,
      detail: f.detail,
    })),
    recommendations: report.recommendations,
  });
}

function handleSyncRules(args: unknown) {
  const parsed = SyncRulesSchema.parse(args);
  const cwd = parsed.cwd;
  const result = syncToProject(cwd);

  return jsonResult({
    added: result.added,
    skipped: result.skipped,
    addedCount: result.added.length,
    skippedCount: result.skipped.length,
  });
}

function handlePromoteRule(args: unknown) {
  const parsed = PromoteRuleSchema.parse(args);
  const cwd = parsed.cwd;

  try {
    const rule = promoteRule(parsed.ruleText, cwd);
    return jsonResult({
      success: true,
      ruleId: rule.id,
      text: rule.text,
      category: rule.category,
      sourceProject: rule.sourceProject,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResult({ success: false, error: message });
  }
}

// --- Tool Dispatcher ---

function handleToolCall(name: string, args: unknown) {
  switch (name) {
    case 'claudemd_get_suggestions':
      return handleGetSuggestions(args);
    case 'claudemd_get_stats':
      return handleGetStats(args);
    case 'claudemd_get_stale_rules':
      return handleGetStaleRules(args);
    case 'claudemd_get_duplicates':
      return handleGetDuplicates(args);
    case 'claudemd_apply_suggestion':
      return handleApplySuggestion(args);
    case 'claudemd_dismiss_suggestion':
      return handleDismissSuggestion(args);
    case 'claudemd_create_backup':
      return handleCreateBackup(args);
    case 'claudemd_list_backups':
      return handleListBackups(args);
    case 'claudemd_get_health':
      return handleGetHealth(args);
    case 'claudemd_sync_rules':
      return handleSyncRules(args);
    case 'claudemd_promote_rule':
      return handlePromoteRule(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Server Setup ---

async function main(): Promise<void> {
  const server = new Server(
    {
      name: 'cm',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [...TOOLS] };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      return handleToolCall(name, args ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Tool error [${name}]:`, message);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('claudemd-lint MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error starting MCP server:', err);
  process.exit(1);
});
