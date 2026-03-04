// ============================================================
// claudemd-lint — Shared Types
// ============================================================

// --- Correction Detection ---

export interface Correction {
  id: string;
  timestamp: number;
  sessionId: string;
  pattern: string;
  originalMessage: string;
  extractedRule: string;
  category: CorrectionCategory;
  confidence: number; // 0-1
}

export type CorrectionCategory =
  | 'style'        // "Use X instead of Y"
  | 'tool'         // "Always use tool X"
  | 'convention'   // "Follow naming convention X"
  | 'behavior'     // "Don't do X", "Always do Y"
  | 'structure'    // "Put files in X directory"
  | 'language'     // "Respond in Korean", "Use formal tone"
  | 'general';

// --- Rule Suggestions ---

export interface RuleSuggestion {
  id: string;
  createdAt: number;
  ruleText: string;
  targetFile: string;       // Which CLAUDE.md to add to
  targetSection: string;    // Section heading
  sourceCorrections: string[]; // Correction IDs
  occurrences: number;
  confidence: number;       // 0-1
  status: 'pending' | 'accepted' | 'dismissed';
  dismissReason?: string;
}

// --- CLAUDE.md Parser ---

export interface ClaudeMdDocument {
  filePath: string;
  sections: ClaudeMdSection[];
  rawContent: string;
}

export interface ClaudeMdSection {
  id: string;             // Content hash for stable ID
  heading: string;        // Section heading text
  level: number;          // Heading level (1-6), 0 for root
  content: string;        // Raw markdown content under this heading
  rules: ClaudeMdRule[];  // Extracted rules
  children: ClaudeMdSection[];
}

export interface ClaudeMdRule {
  id: string;             // Content hash
  text: string;           // Rule text
  type: RuleType;
  sectionId: string;      // Parent section ID
  line: number;           // Line number in file
}

export type RuleType =
  | 'bullet'       // - Do X
  | 'numbered'     // 1. Do X
  | 'codeblock'    // ```...```
  | 'table-row'    // | col1 | col2 |
  | 'paragraph';   // Free text rule

// --- Dedup Engine ---

export interface DuplicateReport {
  duplicates: DuplicatePair[];
  conflicts: ConflictPair[];
  misplaced: MisplacedRule[];
}

export interface DuplicatePair {
  ruleA: ClaudeMdRule;
  ruleB: ClaudeMdRule;
  similarity: number;
  type: 'exact' | 'semantic';
}

export interface ConflictPair {
  ruleA: ClaudeMdRule;
  ruleB: ClaudeMdRule;
  reason: string;
}

export interface MisplacedRule {
  rule: ClaudeMdRule;
  currentSection: string;
  suggestedSection: string;
}

// --- Analytics ---

export interface RuleReference {
  ruleId: string;
  sessionId: string;
  timestamp: number;
  context: string; // Brief context of how it was referenced
}

export interface RuleAnalytics {
  ruleId: string;
  ruleText: string;
  totalReferences: number;
  lastReferenced: number;
  sessionsReferenced: string[];
}

export interface AnalyticsData {
  rules: Record<string, RuleAnalytics>;
  sessions: SessionRecord[];
  totalSessions: number;
}

export interface SessionRecord {
  sessionId: string;
  timestamp: number;
  correctionsDetected: number;
  rulesReferenced: number;
}

// --- Templates ---

export type ProjectType = 'nextjs' | 'python' | 'go' | 'rust' | 'generic';

export interface Template {
  name: string;
  projectType: ProjectType;
  detectFiles: string[];  // Files that indicate this project type
  sections: TemplateSection[];
}

export interface TemplateSection {
  heading: string;
  level: number;
  content: string;       // Template content (may include {{variables}})
  autoFill?: boolean;     // Whether to auto-fill from project analysis
}

// --- Storage ---

export interface StorageData {
  corrections: Correction[];
  suggestions: RuleSuggestion[];
  analytics: AnalyticsData;
  config: PluginConfig;
}

export interface PluginConfig {
  correctionThreshold: number;   // Min occurrences before suggesting (default: 3)
  similarityThreshold: number;   // Jaccard threshold for dedup (default: 0.7)
  staleSessions: number;         // Sessions before rule is "stale" (default: 20)
  autoDetect: boolean;           // Enable auto-detection (default: true)
}

export const DEFAULT_CONFIG: PluginConfig = {
  correctionThreshold: 3,
  similarityThreshold: 0.7,
  staleSessions: 20,
  autoDetect: true,
};

// --- Backup ---

export interface BackupEntry {
  id: string;           // timestamp-based ID
  timestamp: number;
  filePath: string;     // original CLAUDE.md path
  backupPath: string;   // path to backup file
  fileSize: number;
  ruleCount: number;
}

// --- Health Score ---

export interface HealthReport {
  score: number;          // 0-100
  grade: string;          // A+, A, B+, B, C+, C, D, F
  factors: HealthFactor[];
  recommendations: string[];
}

export interface HealthFactor {
  name: string;
  score: number;          // 0-100 for this factor
  weight: number;         // 0-1
  detail: string;         // Human-readable explanation
}

// --- Shared Rules (Multi-Project Sync) ---

export interface SharedRule {
  id: string;            // content hash
  text: string;          // rule text
  category: string;      // auto-categorized
  sourceProject: string; // project path where first added
  addedAt: number;       // timestamp
}

export interface SharedRulesStore {
  rules: SharedRule[];
  lastSynced: Record<string, number>; // project path → last sync timestamp
}

// --- Hook I/O ---

export interface HookInput {
  cwd?: string;
  session_id?: string;
  sessionId?: string;
  prompt?: string;
  message?: { content?: string };
  parts?: Array<{ type: string; text?: string }>;
  tool_name?: string;
  toolName?: string;
  tool_response?: string;
  toolOutput?: string;
  directory?: string;
}

export interface HookOutput {
  continue: boolean;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext: string;
  };
}
