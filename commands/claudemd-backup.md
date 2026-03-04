---
description: Backup and restore CLAUDE.md files — create backups before changes, list history, restore previous versions
allowed-tools: Read, Edit, Glob, Bash
---

Help the user backup and restore their CLAUDE.md files by following these steps:

1. Use Glob to discover all CLAUDE.md files in the project: `**/CLAUDE.md` (check root, `.claude/`, and subdirectories).

2. Present a backup menu to the user:

```
╔═══════════════════════════════════════════╗
║       CLAUDE.md Backup Manager            ║
╠═══════════════════════════════════════════╣
║  1. Create backup                         ║
║  2. List backups                          ║
║  3. Restore from backup                   ║
╚═══════════════════════════════════════════╝
```

Ask the user which option they want.

### Option 1: Create Backup

1. Show the discovered CLAUDE.md files and ask which one to back up (or back up all).
2. For each file:
   - Read the file content.
   - Create the backup directory at `.claudemd-lint/backups/` if it doesn't exist (use `mkdir -p`).
   - Generate a timestamp ID in format `YYYY-MM-DDTHH-MM-SS` (e.g. `2026-03-04T12-30-00`).
   - Copy the file to `.claudemd-lint/backups/CLAUDE.md.{timestamp}.bak`.
   - Count the rules in the file (bullet points, numbered items, code blocks, table rows, paragraphs >30 chars).
   - Read the existing `.claudemd-lint/backups/backups.json` manifest (or create `[]` if missing).
   - Append a new entry: `{ id, timestamp, filePath, backupPath, fileSize, ruleCount }`.
   - Write the updated manifest back.
   - If more than 10 backups exist, delete the oldest ones (both the `.bak` file and the manifest entry).
3. Confirm success:

```
+-------------------------------------------+
| Backup created successfully!              |
+-------------------------------------------+
| ID:        2026-03-04T12-30-00            |
| File:      CLAUDE.md                      |
| Size:      1,234 bytes                    |
| Rules:     42                             |
| Backup at: .claudemd-lint/backups/... |
+-------------------------------------------+
```

### Option 2: List Backups

1. Read `.claudemd-lint/backups/backups.json`.
2. If no backups exist, show: "No backups found. Use option 1 to create one."
3. Otherwise, display a table sorted by timestamp (newest first):

```
+----+----------------------+----------+-------+----------------------------+
| #  | Timestamp            | Size     | Rules | Backup Path                |
+----+----------------------+----------+-------+----------------------------+
| 1  | 2026-03-04 12:30:00  | 1,234 B  |  42   | .claudemd-lint/back... |
| 2  | 2026-03-03 15:45:00  |   987 B  |  38   | .claudemd-lint/back... |
+----+----------------------+----------+-------+----------------------------+
Total backups: 2
```

### Option 3: Restore from Backup

1. Read `.claudemd-lint/backups/backups.json` and list available backups (same table as option 2).
2. If no backups exist, show: "No backups available to restore from."
3. Ask the user which backup to restore (by number or ID).
4. Show a confirmation prompt before overwriting:

```
⚠️  This will overwrite:
   /path/to/CLAUDE.md

   with backup from: 2026-03-04 12:30:00
   (42 rules, 1,234 bytes)

   Proceed? (y/n)
```

5. If confirmed, copy the backup file over the original CLAUDE.md path.
6. Confirm success:

```
+-------------------------------------------+
| Restore completed successfully!           |
+-------------------------------------------+
| Restored: CLAUDE.md                       |
| From:     2026-03-04T12-30-00             |
+-------------------------------------------+
```

### Error Handling

- If `.claudemd-lint/` directory doesn't exist: "No backup data found. Run this command and choose 'Create backup' first."
- If a backup file is missing from disk but exists in manifest: remove it from the manifest and notify the user.
- If the CLAUDE.md file to restore to doesn't exist: warn the user and ask if they want to create it.
