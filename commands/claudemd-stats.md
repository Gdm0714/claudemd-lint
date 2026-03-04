---
description: Show CLAUDE.md analytics dashboard — rule usage, stale rules, correction stats
allowed-tools: Read, Glob, Bash
---

Show me the CLAUDE.md analytics dashboard by following these steps:

1. Read `.claudemd-lint/analytics.json` to get rule reference data (sessions, rule usage counts).

2. Use Glob to find all CLAUDE.md files in the project (check `CLAUDE.md`, `.claude/CLAUDE.md`, and parent directories up to 3 levels).

3. Read each CLAUDE.md file and count total rules (bullet points, numbered list items, and paragraphs longer than 30 chars).

4. Read `.claudemd-lint/corrections.json` for correction history (array of correction objects).

5. Read `.claudemd-lint/suggestions.json` for suggestion history (array of suggestion objects with `status` field: 'pending', 'accepted', or 'dismissed').

6. Compute these stats:
   - **Total Rules**: count of all rules across all CLAUDE.md files
   - **Total Rule Files**: number of CLAUDE.md files found
   - **Total References Tracked**: sum of `totalReferences` for all entries in analytics.rules
   - **Sessions Tracked**: `analytics.totalSessions`
   - **Most Referenced Rules (Top 5)**: sort analytics.rules by totalReferences descending, take top 5
   - **Stale Rules**: rules in analytics.rules where `sessionsReferenced` array length is 0, or where the rule hasn't appeared in the last 20 sessions (compare against total session count)
   - **Never Referenced Rules**: rules present in CLAUDE.md files but with no entry in analytics.rules
   - **Corrections Detected**: length of corrections array
   - **Rules Suggested**: length of suggestions array
   - **Rules Accepted**: count of suggestions with status === 'accepted'
   - **Conversion Rate**: rulesAccepted / correctionsDetected (show as percentage)
   - **Avg Corrections/Session**: correctionsDetected / sessionsTracked

7. Format and display the dashboard exactly like this:

```
📊 CLAUDE.md Analytics Dashboard
═══════════════════════════════════════════
Total Rules: XX across Y file(s)
Total References Tracked: XX
Sessions Tracked: XX

🔥 Most Referenced Rules (Top 5)
  1. "rule text truncated to 60 chars..." — XX references
  2. "rule text..." — XX references
  3. "rule text..." — XX references
  4. "rule text..." — XX references
  5. "rule text..." — XX references

❄️  Stale Rules (unreferenced in 20+ sessions)
  - "rule text..." — last referenced: YYYY-MM-DD (or "never")
  (None if no stale rules)

🚫 Never Referenced Rules
  - "rule text..."
  (None if all rules have been referenced)

📈 Correction Stats
  Corrections Detected: XX
  Rules Suggested: XX
  Rules Accepted: XX (XX%)
  Avg Corrections/Session: X.X
```

If any data files are missing or empty, show zeros for those metrics and note that tracking will begin once the hooks are active.

If `.claudemd-lint/` directory doesn't exist at all, display:
```
⚠️  No analytics data found.
Run `claudemd-init` first to set up the plugin, then use Claude Code normally to start collecting data.
```
