---
description: Sync shared rules across projects — promote local rules to global, pull global rules into this project
allowed-tools: Read, Edit, Glob, Bash
---

Manage shared rules that sync across multiple projects. Present a menu with these options:

## Menu

1. **Pull shared rules** — sync global rules into this project's CLAUDE.md
2. **Push rule to shared** — select a local rule and promote it to global
3. **List shared rules** — show all global rules with source project
4. **Remove shared rule** — remove a rule from global store

Ask the user which option they want, then follow the corresponding instructions below.

---

## Option 1: Pull shared rules

1. Read `~/.claude/shared-rules.json` to get the global shared rules store.
2. If no shared rules exist, display:
   ```
   No shared rules found. Use option 2 to push local rules to the shared store first.
   ```
3. Find this project's CLAUDE.md (check `CLAUDE.md`, then `.claude/CLAUDE.md`).
4. Read the CLAUDE.md file and extract all existing rules.
5. For each shared rule, check if a similar rule already exists using word-level comparison (tokenize both, compute Jaccard similarity — skip if > 0.7).
6. Add new rules to CLAUDE.md under their category section heading as bullet points.
7. Display results:
   ```
   📥 Sync Complete
   ═══════════════════════════════════
   Added:   X rules
   Skipped: Y rules (already present)

   ✅ Added rules:
     - [rule text] → [section]
     - [rule text] → [section]

   ⏭️  Skipped (similar rule exists):
     - [rule text]
   ```

---

## Option 2: Push rule to shared

1. Find and read this project's CLAUDE.md.
2. Extract all rules (bullet points, numbered items, paragraphs > 30 chars).
3. Display the rules as a numbered list grouped by section:
   ```
   📋 Local Rules
   ═══════════════════════════════════
   ## Build & Run
     1. Use `npm run dev` to start the development server
     2. Always run `npm test` before committing

   ## Code Style
     3. Always use TypeScript strict mode
     4. Never use `any` type in TypeScript code
   ...
   ```
4. Ask the user which rule(s) to promote (accept comma-separated numbers or "all").
5. Read `~/.claude/shared-rules.json`.
6. For each selected rule:
   - Generate a content hash (SHA-256, first 12 chars) as the rule ID.
   - Auto-categorize based on keywords (build/test/style/git/deploy/conventions).
   - Check for duplicates in the shared store (Jaccard > 0.7 = skip).
   - Add to the shared store if not a duplicate.
7. Write updated `~/.claude/shared-rules.json`.
8. Display results:
   ```
   📤 Push Complete
   ═══════════════════════════════════
   Promoted: X rules
   Skipped:  Y rules (already in shared store)

   ✅ Promoted:
     - [rule text] (category: [category])
   ```

---

## Option 3: List shared rules

1. Read `~/.claude/shared-rules.json`.
2. If empty, display "No shared rules found."
3. Otherwise display all rules grouped by category:
   ```
   🌐 Shared Rules
   ═══════════════════════════════════
   Total: X rules

   ## Build & Run
     - Use `npm run dev` to start the development server
       ID: a1b2c3d4e5f6 | Source: /path/to/project | Added: 2025-01-15

   ## Code Style
     - Always use TypeScript strict mode
       ID: f6e5d4c3b2a1 | Source: /path/to/project | Added: 2025-01-15

   Last synced to this project: [timestamp or "never"]
   ```

---

## Option 4: Remove shared rule

1. Read `~/.claude/shared-rules.json`.
2. If empty, display "No shared rules to remove."
3. Display all rules as a numbered list:
   ```
   🗑️  Remove Shared Rule
   ═══════════════════════════════════
     1. [rule text] (category: [category])
     2. [rule text] (category: [category])
   ```
4. Ask the user which rule(s) to remove (accept comma-separated numbers).
5. Remove the selected rules from the store.
6. Write updated `~/.claude/shared-rules.json`.
7. Display confirmation:
   ```
   Removed X rule(s) from the shared store.
   ```
