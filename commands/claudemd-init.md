---
description: Initialize CLAUDE.md from a project template
argument-hint: "[template: nextjs|python|go|generic]"
allowed-tools: Read, Write, Glob, Bash
---

Initialize a `CLAUDE.md` file for the current project using the best-matching template.

## Steps

1. **Determine project type**
   - If an argument was provided (e.g. `nextjs`, `python`, `go`, `generic`), use that template directly.
   - Otherwise, auto-detect by checking for indicator files in the current working directory:
     - `next.config.js`, `next.config.mjs`, or `next.config.ts` → `nextjs`
     - `go.mod` or `go.sum` → `go`
     - `pyproject.toml`, `setup.py`, `requirements.txt`, or `Pipfile` → `python`
     - No match → `generic`

2. **Read project files to fill template variables**
   - Read `package.json` (if present) to extract: project name, Next.js version, React version, styling libraries.
   - Read `go.mod` (if present) to extract: module path, Go version.
   - Read `pyproject.toml` or `requirements.txt` (if present) to extract: project name, Python version, framework.
   - Detect the package manager from lock files: `bun.lockb` / `bun.lock` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else → npm.
   - Fall back to sensible defaults for any variable that cannot be determined.

3. **Generate CLAUDE.md content**
   - Apply the detected template sections in order.
   - Replace all `{{variable}}` placeholders with the detected values.
   - For `autoFill: true` sections, use the detected commands rather than the raw placeholder text.

4. **Show preview and ask for confirmation**
   - Print the full generated `CLAUDE.md` content to the user.
   - Ask: "Write this as `CLAUDE.md` in the current directory? [yes/no]"
   - If the user answers no, ask if they want to adjust any section or variable before writing.

5. **Write CLAUDE.md**
   - On confirmation, write the generated content to `CLAUDE.md` in the current working directory.
   - If `CLAUDE.md` already exists, warn the user and ask whether to overwrite or merge.
   - Confirm success with the file path written.
