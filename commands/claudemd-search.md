---
description: Search rules across all CLAUDE.md files by keyword — find specific rules quickly
allowed-tools: Read, Glob, Grep
---

Search for rules across all CLAUDE.md files by following these steps:

1. Check if the user provided a search query. If not, ask: "What keyword or phrase would you like to search for in your CLAUDE.md rules?"

2. Use Glob to find all CLAUDE.md files in the project:
   - `CLAUDE.md` (project root)
   - `.claude/CLAUDE.md`
   - `**/CLAUDE.md` (subdirectories)

3. Read each discovered CLAUDE.md file.

4. For each file, extract all rules by scanning every line:
   - Skip lines inside code blocks (between ``` markers).
   - **Bullet points**: lines matching `^\s*[-*+]\s+(.+)$` where the text is longer than 10 characters.
   - **Numbered items**: lines matching `^\s*\d+\.\s+(.+)$` where the text is longer than 10 characters.
   - Track the line number (1-based) for each extracted rule.

5. For each extracted rule, check if the search query appears as a **case-insensitive substring** in the rule text.

6. Collect all matching rules, grouped by their source file path.

7. Display results in this exact format:

```
🔍 Search Results for "QUERY"
═══════════════════════════════════════
Found N matches across M files

📄 CLAUDE.md
  Line 12: "Always use TypeScript strict mode"
  Line 13: "Never use `any` type in TypeScript code"

📄 .claude/CLAUDE.md
  Line 5: "Use TypeScript for all new files"
  Line 8: "Run tsc --noEmit before committing TypeScript changes"
```

Rules:
- Show the file path relative to the project root (not absolute paths).
- Show the 1-based line number where the rule appears in the file.
- Show the full rule text in quotes.
- Group results by file. Show files in discovery order.
- Show the total match count and file count in the summary line.

8. If no matches are found, display:

```
🔍 Search Results for "QUERY"
═══════════════════════════════════════
No rules found matching "QUERY". Try a broader search term.
```

9. After showing results, offer helpful follow-up suggestions:
   - If many matches: "Tip: Use /claudemd-health to check for duplicate rules."
   - If zero matches: "Tip: You can add new rules to CLAUDE.md or use /claudemd-suggest to review AI-generated suggestions."
