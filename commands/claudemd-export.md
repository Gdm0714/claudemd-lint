---
description: Export portable rules from CLAUDE.md (strip project-specific paths)
allowed-tools: Read, Write, Glob
---

Export reusable, portable rules from one or more `CLAUDE.md` files by stripping project-specific paths and absolute references.

## Steps

1. **Locate CLAUDE.md files**
   - Look for `CLAUDE.md` in the current working directory.
   - Also check common subdirectories: `.claude/`, `docs/`.
   - If multiple files are found, list them and ask the user which to export from (default: current directory).

2. **Read and parse the selected CLAUDE.md**
   - Read the file content.
   - Split into sections by heading (lines starting with `#`).
   - For each section, collect its heading and content.

3. **Extract and sanitize rules**
   - For each section, extract actionable rules:
     - Bullet points (`- ...`)
     - Numbered list items (`1. ...`)
     - Code blocks (` ``` `)
     - Paragraph rules (non-empty lines that are not headings)
   - Strip project-specific information:
     - Remove or replace absolute paths (e.g. `/Users/name/project/src` → `<project-root>/src`)
     - Remove or replace references to specific usernames or machine names
     - Remove lines that contain only local environment values (e.g. `PORT=3001`, `DATABASE_URL=postgres://localhost/...`)
     - Replace specific project names with `{{projectName}}` placeholder where appropriate
   - Preserve:
     - Technology conventions and best practices
     - Tool usage rules
     - Code style rules
     - Testing and build conventions

4. **Format as importable snippet**
   - Produce a clean markdown document with:
     - A heading: `# Exported Rules`
     - A note at the top: `<!-- Exported by claudemd-export — review before use -->`
     - Each original section preserved as a sub-section
     - Sanitized content under each heading
   - If a section is entirely project-specific and contains no portable rules, omit it.

5. **Write output**
   - Default output file: `claude-rules-export.md` in the current directory.
   - Show the user the generated content.
   - Ask: "Write to `claude-rules-export.md`? [yes/no]"
   - On confirmation, write the file.
   - Remind the user they can paste the contents into another project's `CLAUDE.md` or a global rules file.
