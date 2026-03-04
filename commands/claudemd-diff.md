---
description: Show changes in CLAUDE.md since the last backup — see what rules were added, removed, or modified
allowed-tools: Read, Glob, Bash
---

Show the diff between the current CLAUDE.md and the most recent backup by following these steps:

1. Use Glob to find all current CLAUDE.md files:
   - `CLAUDE.md` (project root)
   - `.claude/CLAUDE.md`

2. Check for available backups at `.claudemd-lint/backups/backups.json`.
   - Read the manifest file. It contains an array of backup entries: `{ id, timestamp, filePath, backupPath, fileSize, ruleCount }`.
   - If the file doesn't exist or the directory is missing, display:

```
⚠️  No backups found. Run /claudemd-backup first to create a baseline.
```

3. If backups exist, sort them by `timestamp` descending (newest first) and select the most recent one by default.
   - If there are multiple backups, briefly list them and mention: "Comparing against the most recent backup. To compare against a different backup, tell me which one (by number or date)."

4. Read the backup file from its `backupPath`.

5. Read the current CLAUDE.md file.

6. Extract rules from **both** versions using the same logic:
   - Skip lines inside code blocks (between ``` markers).
   - **Bullet points**: lines matching `^\s*[-*+]\s+(.+)$` where text is longer than 10 characters. Extract the text after the bullet marker.
   - **Numbered items**: lines matching `^\s*\d+\.\s+(.+)$` where text is longer than 10 characters. Extract the text after the number.
   - Normalize each rule for comparison: trim whitespace, collapse multiple spaces to one.

7. Compare the two rule sets:
   - **Added rules**: rules in the current version that do NOT appear in the backup (after normalization).
   - **Removed rules**: rules in the backup that do NOT appear in the current version (after normalization).
   - **Unchanged rules**: rules that appear in both versions (after normalization).

8. Format the backup timestamp as a human-readable date (e.g., "2026-03-04 12:30").

9. Display the diff report in this exact format:

```
📝 CLAUDE.md Changes (since YYYY-MM-DD HH:MM)
═══════════════════════════════════════
+ Added (N rules):
  + "New rule text here"
  + "Another new rule"
  + "Third new rule"

- Removed (N rules):
  - "Old rule that was deleted"

~ Unchanged: N rules

Summary: N added, N removed, N unchanged
```

Display rules:
- Show each added rule prefixed with `  + ` in quotes.
- Show each removed rule prefixed with `  - ` in quotes.
- For unchanged, just show the count (not each rule).
- If no rules were added, show `+ Added (0 rules): (none)`.
- If no rules were removed, show `- Removed (0 rules): (none)`.

10. If the user specifies a particular backup to compare against (by number or date), use that backup instead of the most recent one.

11. After showing the report, offer actionable follow-ups:
    - If rules were removed: "Tip: If removals were unintentional, run /claudemd-backup and choose 'Restore' to revert."
    - If rules were added: "Tip: Run /claudemd-health to check if new rules introduced any duplicates."
    - If no changes: "Your CLAUDE.md is unchanged since the last backup."
