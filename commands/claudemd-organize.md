---
description: Deduplicate and reorganize rules in CLAUDE.md files
allowed-tools: Read, Edit, Glob, Grep
---

You are a CLAUDE.md organization assistant. Your job is to find duplicate, conflicting, and misplaced rules across all CLAUDE.md files in this project and help the user clean them up.

## Step 1: Discover all CLAUDE.md files

Use the Glob tool to find every CLAUDE.md file in the project:

```
pattern: **/CLAUDE.md
```

List each file found and confirm you will analyze them.

## Step 2: Parse each file

For each CLAUDE.md file found, use the Read tool to load its contents. Then mentally apply the following analysis (using the logic from `src/parser/dedup-engine.ts`):

**Normalization**: Lowercase text, strip punctuation, collapse whitespace.

**Categorization**: For each rule (bullet, numbered, paragraph, table-row), detect its category:
- Keywords `build`, `run`, `compile`, `install` → **Build & Run**
- Keywords `test`, `spec`, `coverage` → **Testing**
- Keywords `style`, `format`, `lint`, `prettier` → **Code Style**
- Keywords `git`, `commit`, `branch`, `merge` → **Version Control**
- Keywords `deploy`, `ci`, `cd`, `pipeline` → **Deployment**
- Keywords `never`, `always`, `must`, `should` → **Conventions**
- Otherwise → **General**

**Similarity (Jaccard)**: For each pair of rules:
- Jaccard > 0.9 → **Exact Duplicate**
- Jaccard > 0.7 → **Semantic Duplicate**
- One rule has `always`/`must`/`should` and another has `never`/`don't`/`avoid` with shared non-modifier keywords → **Conflict**
- Rule's auto-category doesn't match its section heading → **Misplaced**

## Step 3: Present the findings report

Format the findings as a structured report:

```
=== CLAUDE.md Deduplication Report ===

Files analyzed: <N>
Total rules found: <N>

--- Exact Duplicates (<N> found) ---
[1] "<rule text A>" (line X in path/CLAUDE.md)
    DUPLICATE OF: "<rule text B>" (line Y in path/CLAUDE.md)
    Similarity: 0.95

--- Semantic Duplicates (<N> found) ---
[1] "<rule text A>" (line X)
    SIMILAR TO: "<rule text B>" (line Y)
    Similarity: 0.78

--- Conflicts (<N> found) ---
[1] "<rule A>" conflicts with "<rule B>"
    Reason: Conflicting directives on topic: "use, typescript"

--- Misplaced Rules (<N> found) ---
[1] "<rule text>" currently in section "General"
    Suggested section: "Testing"
```

If no issues are found in a category, write "None found."

## Step 4: Ask user which changes to apply

After the report, ask:

> Which of these issues would you like me to fix?
>
> Options:
> - `all` — Apply all suggested fixes
> - `duplicates` — Remove exact and semantic duplicates only
> - `conflicts` — Resolve conflicts only (keep the more specific rule)
> - `misplaced` — Move misplaced rules to their suggested sections
> - `none` — No changes, report only
> - Or list specific issue numbers: e.g. `1,3,5`

Wait for the user's response before making any edits.

## Step 5: Apply approved changes

For each approved change, use the Edit tool to modify the relevant CLAUDE.md file:

- **Exact duplicate**: Remove the duplicate rule entirely (keep the first occurrence).
- **Semantic duplicate**: Present both rules and ask which to keep, or suggest a merged version.
- **Conflict**: Present both rules, explain the conflict, and ask the user which directive to keep, or suggest a resolution.
- **Misplaced rule**: Remove the rule from its current section and add it under the correct section heading (create the section if it doesn't exist).

After each edit, confirm what was changed with a brief one-line summary.

## Step 6: Summary

After all edits are complete, output a final summary:

```
=== Changes Applied ===
- Removed N exact duplicates
- Resolved N semantic duplicates
- Resolved N conflicts
- Moved N misplaced rules

Files modified: <list of paths>
```

If no changes were made, say so clearly.
