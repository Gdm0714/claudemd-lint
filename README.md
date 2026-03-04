# claudemd-lint

> Smart CLAUDE.md manager for Claude Code — auto-detect corrections, suggest rules, deduplicate, and track effectiveness.

CLAUDE.md is Claude Code's instruction file, but managing it is 100% manual. This plugin makes it **proactive**: it watches your corrections, suggests rules, removes duplicates, and shows you what's working.

## Features

### Auto-Detect Repeated Corrections

Stop repeating yourself. The plugin listens to your messages and detects correction patterns like "No, use X instead", "Always use Y", "I told you to...". After 3+ occurrences, it generates a rule suggestion automatically.

### Smart Dedup & Conflict Detection

Find duplicate rules, conflicting directives ("Always use X" vs "Never use X"), and misplaced rules across all your CLAUDE.md files. Uses Jaccard similarity + overlap coefficient with compound word expansion for accurate matching.

### Health Score

Get a 0-100 quality rating for your CLAUDE.md with a visual dashboard. Six weighted factors: duplicate ratio, stale rules, section structure, rule count balance, conflicts, and correction conversion rate.

### Analytics & Tracking

Every time Claude follows a rule from your CLAUDE.md, the plugin tracks it. See which rules are actively used, which are stale, and your correction-to-rule conversion rate.

### Backup & Restore

Automatic timestamped backups before destructive operations. Up to 10 backups with one-click restore.

### Templates

Auto-detect your project type (Next.js, Python, Go, Rust) and generate a CLAUDE.md with relevant sections pre-filled.

## Installation

```bash
# Add the marketplace
claude plugin marketplace add <your-username>/claudemd-lint

# Install the plugin
claude plugin install claudemd-lint@claudemd-lint

# Restart Claude Code
```

## Commands

| Command | Description |
|---------|-------------|
| `/claudemd-lint:claudemd-suggest` | Review and apply auto-detected rule suggestions |
| `/claudemd-lint:claudemd-organize` | Deduplicate and reorganize CLAUDE.md |
| `/claudemd-lint:claudemd-health` | Check CLAUDE.md health score (0-100) |
| `/claudemd-lint:claudemd-stats` | Show analytics dashboard |
| `/claudemd-lint:claudemd-cleanup` | Remove stale and unused rules |
| `/claudemd-lint:claudemd-backup` | Backup and restore CLAUDE.md |
| `/claudemd-lint:claudemd-init` | Initialize CLAUDE.md from template |
| `/claudemd-lint:claudemd-export` | Export portable rules |

## How It Works

### Hooks (automatic, runs in background)

| Hook | Trigger | What it does |
|------|---------|--------------|
| `UserPromptSubmit` | Every message | Detects correction patterns (22 regex, EN+KR) |
| `Stop` | Session end | Aggregates corrections into rule suggestions |
| `SessionStart` | Session start | Notifies of pending suggestions |
| `PostToolUse` | Edit/Write/Bash | Tracks which rules are being referenced |

### MCP Tools (9 tools, programmatic access)

| Tool | Purpose |
|------|---------|
| `claudemd_get_suggestions` | Pending rule suggestions |
| `claudemd_get_stats` | Rule usage analytics |
| `claudemd_get_stale_rules` | Unreferenced rules |
| `claudemd_get_duplicates` | Duplicate/conflict report |
| `claudemd_get_health` | Health score with breakdown |
| `claudemd_create_backup` | Create CLAUDE.md backup |
| `claudemd_list_backups` | List available backups |
| `claudemd_apply_suggestion` | Accept a suggestion |
| `claudemd_dismiss_suggestion` | Dismiss a suggestion |

### Storage

All data stored in `.claudemd-lint/` (add to `.gitignore`):

```
.claudemd-lint/
├── corrections.json    # Detected correction log
├── suggestions.json    # Pending rule suggestions
├── analytics.json      # Rule reference tracking
├── config.json         # Plugin settings
└── backups/            # CLAUDE.md backup files
```

## Health Score Factors

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| Duplicates | 25% | Ratio of duplicate rules |
| Stale Rules | 20% | Rules unreferenced in 20+ sessions |
| Section Structure | 15% | Rules organized under headings |
| Rule Count | 15% | Sweet spot: 10-50 rules |
| Conflicts | 15% | Contradicting directives |
| Conversion Rate | 10% | Corrections that became rules |

## Configuration

Edit `.claudemd-lint/config.json`:

```json
{
  "correctionThreshold": 3,    // Min occurrences before suggesting
  "similarityThreshold": 0.7,  // Jaccard threshold for dedup
  "staleSessions": 20,         // Sessions before rule is "stale"
  "autoDetect": true            // Enable auto-detection
}
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript + MCP bundle
npm run build

# Type-check only
npx tsc --noEmit

# Run tests
npm test
```

## License

MIT
