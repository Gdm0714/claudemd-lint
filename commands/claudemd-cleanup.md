---
description: Clean up stale and unused rules from CLAUDE.md — find rules not referenced in recent sessions and remove them
allowed-tools: Read, Edit, Glob, Bash
---

Clean up stale and unused rules from CLAUDE.md by following these steps:

1. **Discover CLAUDE.md files**: Use Glob to find all `**/CLAUDE.md` files in the project.

2. **Load analytics**: Read `.claudemd-lint/analytics.json` for rule reference data. If this file or the `.claudemd-lint/` directory doesn't exist, stop and display:
   ```
   ⚠️  No analytics data found.
   Run Claude Code for a few sessions first to build up reference data.
   ```

3. **Load config**: Read `.claudemd-lint/config.json` if it exists. Use the `staleSessions` field as the staleness threshold. Default to `20` if not set.

4. **Check minimum sessions**: If `analytics.totalSessions` is less than 5, stop and display:
   ```
   ⚠️  Only X sessions tracked so far.
   Consider waiting for more data before cleanup (recommended: 10+ sessions).
   ```

5. **Parse rules from CLAUDE.md files**: For each discovered CLAUDE.md, read it and extract every rule — bullet points (`-` or `*`), numbered list items, and standalone paragraphs longer than 30 characters. Record each rule's text (truncated to 80 chars for display), source file path, and line number.

6. **Find stale rules**: A rule is stale if it has an entry in `analytics.rules` but that entry's `sessionsReferenced` array contains no session index in the last N sessions (where N = `staleSessions` threshold). Concretely: a rule is stale if `max(sessionsReferenced) < (analytics.totalSessions - staleSessions)`.

7. **Find never-referenced rules**: Rules present in CLAUDE.md files with no matching entry in `analytics.rules` at all.

8. **Present findings in a clear numbered report**:
   ```
   🧹 CLAUDE.md Cleanup Report
   ═══════════════════════════════════════
   Total rules: XX
   Stale rules (unreferenced in 20+ sessions): XX
   Never-referenced rules: XX

   --- Stale Rules ---
   [1] "rule text here..."
       File: CLAUDE.md, Line: XX
       Last referenced: YYYY-MM-DD (XX sessions ago)

   [2] "rule text here..."
       File: CLAUDE.md, Line: XX
       Last referenced: YYYY-MM-DD (XX sessions ago)

   --- Never-Referenced Rules ---
   [3] "rule text here..."
       File: CLAUDE.md, Line: XX
       (No analytics data — may be new or never triggered)
   ```
   Assign sequential numbers `[1]`, `[2]`, `[3]`... across both sections for easy selection.

9. **If no stale or never-referenced rules exist**, display:
   ```
   ✅ All rules are actively referenced. No cleanup needed.
   ```
   Then stop.

10. **Ask the user what to do**:
    > Which rules would you like to remove?
    > - `all` — Remove all stale and never-referenced rules
    > - `stale` — Remove only stale rules (keep never-referenced)
    > - `never` — Remove only never-referenced rules
    > - Numbers: e.g. `1,3,5` — Remove specific rules by number
    > - `none` — No changes, report only

11. **If the user chooses `none`**, stop without making any changes.

12. **Before making any changes**: Tell the user "Creating backup before cleanup..." and note the full content of each affected CLAUDE.md file internally so you can describe how to restore it if needed.

13. **Determine the set of rules to remove** based on the user's answer:
    - `all` → all stale + all never-referenced
    - `stale` → only stale rules
    - `never` → only never-referenced rules
    - Numbers → only the rules whose `[N]` numbers match the provided list

14. **Apply changes**: For each rule to remove, use the Edit tool to delete its entire line from the source CLAUDE.md file. Remove the complete line including the leading `-`, `*`, or number marker. Do not leave blank lines where the rule was unless blank lines were already present on both sides.

15. **Show summary**:
    ```
    ✅ Cleanup Complete
      Rules removed: X
      Rules kept: X

      Backup available — if needed, you can undo these changes by restoring the original content.
    ```
