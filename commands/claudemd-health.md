---
description: Check CLAUDE.md health score — get a 0-100 quality rating with actionable recommendations
allowed-tools: Read, Glob, Bash, Write
---

Check the CLAUDE.md health score by following these steps:

1. Use Glob to find all CLAUDE.md files in the project (check `CLAUDE.md`, `.claude/CLAUDE.md`, and parent directories up to 3 levels).

2. Read each CLAUDE.md file found.

3. Read `.claudemd-lint/analytics.json` for rule reference data.

4. Read `.claudemd-lint/corrections.json` for correction history.

5. Read `.claudemd-lint/suggestions.json` for suggestion history.

6. Read `.claudemd-lint/config.json` for plugin configuration (default staleSessions = 20, similarityThreshold = 0.7).

7. Count total rules across all CLAUDE.md files. A "rule" is any of these:
   - Bullet point (`-` or `*`) with text content >10 chars (after stripping markdown formatting)
   - Numbered item (`1.`, `2.`, etc.) with text content >10 chars
   - Fenced code block (``` ``` ```) — counts as exactly 1 rule regardless of line count
   - Table row (`|...|...|`) with text content >10 chars — header rows and separator rows (`|---|`) do NOT count
   - Standalone paragraph (not under a list) with >30 chars — headings (`#`, `##`, etc.) do NOT count as rules
   **Exclusions**: Empty lines, markdown headings, HTML comments, and frontmatter (YAML between `---`) are NEVER rules.

8. **Enumerate all rules internally** before scoring. For each rule, record:
   - Rule number (R1, R2, R3...)
   - Type: bullet | numbered | codeblock | tablerow | paragraph
   - First 50 chars of text (for reference)
   This enumeration is for internal computation only — do NOT display it in the output.

9. Determine if analytics data is available: check if `analytics.json` exists and `totalSessions >= 5`.

10. Compute these 7 health factors (each scored 0-100). **All scores MUST use `Math.round()` for integer output.**

   **Duplicates (weight: 12%)**:
   - Compare all rule pairs using word overlap. Only compare pairs where BOTH rules have 3+ meaningful tokens after lowercasing and removing stop words (a, an, the, is, are, to, for, in, of, and, or, with). For Korean text, split by spaces and count tokens with length ≥2.
   - Jaccard similarity = |intersection| / |union| of token sets. >0.9 = exact duplicate. >0.7 = semantic duplicate.
   - Count total duplicate pairs as `D`. Duplicate ratio = `D / totalRules`.
   - Score: `Math.round(Math.max(0, 100 - (duplicateRatio / 0.3) * 100))`. Capped at 0-100.

   **Specificity OR Stale Rules (weight: 15%)**:
   - **If analytics data is NOT available (fewer than 5 sessions)**: Use **Specificity** — measures how concrete and project-specific rules are.
     - A rule is "specific" if it contains ANY of: file path with extension (e.g., `config.py`, `src/`), inline code (backtick-wrapped text), specific numeric values (port numbers, limits, versions), CLI commands (npm, pip, yarn, pnpm, gradle, mvn, docker, kubectl, cargo, go), or UPPER_SNAKE_CASE identifiers (2+ uppercase words joined by underscore). Code blocks are always specific.
     - Count specific rules as `S`. Specificity ratio = `S / totalRules`.
     - Score: `Math.round(Math.min(100, (specificityRatio / 0.6) * 100))`.
   - **If analytics data IS available (5+ sessions)**: Use **Stale Rules** — a rule is stale if unreferenced in the last `staleSessions` (default 20) sessions.
     - Count stale rules as `ST`. Stale ratio = `ST / totalRules`.
     - Score: `Math.round(Math.max(0, 100 - (staleRatio / 0.5) * 100))`.

   **Section Structure (weight: 8%)**:
   - A rule is "sectioned" if it appears after a markdown heading (`#`, `##`, `###`, or `####`) and before the next heading of equal or higher level.
   - Count sectioned rules as `SEC`. Section ratio = `SEC / totalRules`.
   - Score: `Math.round(sectionRatio * 100)`.

   **Conflicts (weight: 7%)**:
   - Detect contradictory rules by finding pairs where:
     - One rule has a positive modifier (always, must, use, require, prefer, 반드시, 사용, 필수, 해야) AND the other has a negative modifier (never, don't, do not, avoid, forbidden, prohibited, 금지, 절대, 하지 마, 마세요, 불가) on the same topic.
     - Topic overlap: 2+ non-stop-word tokens in common between the pair.
   - Count conflict pairs as `C`.
   - Score: `Math.round(Math.max(0, 100 - (C / 3) * 100))`. (0 conflicts = 100, 3+ conflicts = 0).

   **Completeness OR Conversion Rate (weight: 13%)**:
   - **If analytics data is NOT available**: Use **Completeness** — checks if essential topics are covered.
     - Essential topics (5 total) — a topic is "covered" if ANY rule contains at least one of its keywords:
       1. Build/Run: `npm`, `pip`, `gradle`, `yarn`, `pnpm`, `cargo`, `make`, `docker`, `빌드`, `실행`, `build`, `run`, `start`
       2. Code conventions: `style`, `naming`, `lint`, `eslint`, `prettier`, `format`, `컨벤션`, `스타일`, `네이밍`, `convention`
       3. Testing: `test`, `vitest`, `jest`, `pytest`, `테스트`, `검증`, `spec`, `coverage`
       4. Project structure: `structure`, `src/`, `├`, `└`, `│`, `구조`, `directory`, `folder`, `디렉토리`
       5. Version control: `git`, `commit`, `branch`, `merge`, `커밋`, `브랜치`, `rebase`, `PR`, `pull request`
     - Bonus: +1 if at least one fenced code block exists anywhere in CLAUDE.md.
     - Count covered topics as `T`, bonus as `B` (0 or 1).
     - Score: `Math.round(((T + B) / 6) * 100)`.
   - **If analytics data IS available**: Use **Conversion Rate** — ratio of accepted suggestions to total corrections.
     - If no corrections exist: score = 30.
     - Otherwise: conversion ratio = accepted / total. Score: `Math.round(Math.min(100, (conversionRatio / 0.5) * 100))`.

   **Category Diversity (weight: 20%)**:
   - Categorize each rule by keyword matching against its ORIGINAL text (case-insensitive). A rule matches a category if it contains ANY of that category's keywords.
   - Categories and keywords:
     1. **Build & Run**: `build`, `run`, `start`, `dev`, `npm`, `pip`, `yarn`, `pnpm`, `gradle`, `maven`, `cargo`, `make`, `docker`, `빌드`, `실행`, `서버`
     2. **Testing**: `test`, `spec`, `vitest`, `jest`, `pytest`, `coverage`, `mock`, `stub`, `fixture`, `테스트`, `검증`, `단위`
     3. **Code Style**: `style`, `naming`, `lint`, `eslint`, `prettier`, `format`, `indent`, `quote`, `semicolon`, `스타일`, `네이밍`, `포맷`
     4. **Version Control**: `git`, `commit`, `branch`, `merge`, `rebase`, `PR`, `pull request`, `push`, `tag`, `커밋`, `브랜치`, `푸시`
     5. **Deployment**: `deploy`, `staging`, `production`, `CI`, `CD`, `pipeline`, `release`, `배포`, `운영`, `스테이징`
     6. **Conventions**: `always`, `never`, `must`, `forbidden`, `prohibited`, `prefer`, `avoid`, `금지`, `반드시`, `필수`, `절대`, `컨벤션`
   - For ASCII keywords use word boundary matching (`\bkeyword\b`). For Korean keywords use substring inclusion.
   - A rule matching NO category is "General". Count distinct matched categories (excluding General) as `CAT`. Count General rules as `G`.
   - Base score: 4+ categories = 100, 3 = 80, 2 = 50, 1 = 25, 0 = 10.
   - General penalty: if `G / totalRules > 0.6`, multiply base score by 0.6.
   - Score: `Math.round(baseScore * penalty)`.

   **Actionability (weight: 25%)**:
   - Only evaluate directive-capable rules: bullets, numbered items, paragraphs. **Exclude code blocks and table rows** — they are reference material, not directives.
   - Count directive-capable rules as `DC`.
   - A rule is "actionable" if it contains ANY of these keywords (case-insensitive):
     - **English**: `always`, `never`, `must`, `should`, `shall`, `use`, `avoid`, `prefer`, `ensure`, `require`, `run`, `don't`, `do not`, `make sure`, `forbidden`, `prohibited`, `configure`, `set`, `enable`, `disable`, `install`, `import`, `export`
     - **Korean**: `반드시`, `금지`, `절대`, `필수`, `사용하세요`, `사용하지`, `하지 마`, `않도록`, `해야`, `불가`, `안 됨`, `주의`, `확인`, `필요합니다`, `하세요`, `마세요`, `말 것`, `않습니다`, `바랍니다`, `권장`
   - Count actionable rules as `A`.
   - Actionable ratio = `A / DC`. (If DC == 0, score = 100.)
   - Score: `Math.round(Math.min(100, (actionableRatio / 0.7) * 100))`.

11. Compute overall score as weighted sum: `Math.round(sum(factor.score * factor.weight))`.
    - Weights MUST sum to 1.00: 0.12 + 0.15 + 0.08 + 0.07 + 0.13 + 0.20 + 0.25 = 1.00.

12. Map score to grade:
    - 90+ = A+, 85+ = A, 80+ = B+, 75+ = B, 70+ = C+, 60+ = C, 50+ = D, <50 = F

13. **History tracking**:
    - Read `.claudemd-lint/health-history.json`. If it doesn't exist, treat as empty array `[]`.
    - After computing all scores, append a new entry to the array:
      ```json
      {
        "date": "YYYY-MM-DD HH:mm",
        "overall": <overallScore>,
        "grade": "<grade>",
        "factors": {
          "duplicates": <score>,
          "specificity": <score>,
          "sectionStructure": <score>,
          "conflicts": <score>,
          "completeness": <score>,
          "categoryDiversity": <score>,
          "actionability": <score>
        },
        "totalRules": <N>
      }
      ```
    - Keep only the last 20 entries (remove oldest if exceeding).
    - Write the updated array back to `.claudemd-lint/health-history.json`.
    - If there is a previous entry, compute `delta = currentOverall - previousOverall` for display.

14. Generate 1-3 recommendations from the lowest-scoring factors (skip factors scoring 80+).

15. **Actionability auto-fix**: If Actionability score is below 70, additionally show up to 3 specific rewrite examples from the non-actionable rules. Format:
    ```
    🔧 Suggested Rewrites:
      Before: "XML 전체가 1000byte를 넘으면 DB 저장 실패"
      After:  "XML 전체가 1000byte를 넘지 않도록 반드시 확인하세요"

      Before: "Lombok 사용"
      After:  "Lombok을 반드시 사용하세요"
    ```
    Pick the non-actionable rules that would benefit most from adding directive keywords. Show the original rule text (trimmed to 60 chars) and a rewritten version with an appropriate directive keyword added.

16. **Output Language Rules**:
    - **Dashboard frame** (factor names, headers like "Overall Score", "Factor Breakdown", progress bars): Always in **English**.
    - **Recommendations and Summary text**: Match the **primary language of the CLAUDE.md** being analyzed.
      - If CLAUDE.md is primarily Korean → write recommendations in Korean.
      - If CLAUDE.md is primarily English → write recommendations in English.
      - If mixed languages → default to **Korean**.
    - To detect the primary language: check whether the majority of rule text (excluding code blocks, paths, and technical terms) contains Korean characters (Hangul). If ≥30% of rules contain Korean text, treat as Korean-primary.

17. Display the visual dashboard exactly like this:

```
🏥 CLAUDE.md Health Report
═══════════════════════════════════════
Overall Score: XX/100 (GRADE) [△+N or ▽-N vs previous, omit if no history]
████████████████████░░░░░░░░ XX%

Factor Breakdown:
  Duplicates:          ████████████████████ XX/100 (×0.12 = XX.X)
  Specificity:         ████████████████████ XX/100 (×0.15 = XX.X)
  Section Structure:   ████████████████████ XX/100 (×0.08 = XX.X)
  Conflicts:           ████████████████████ XX/100 (×0.07 = XX.X)
  Completeness:        ████████████████████ XX/100 (×0.13 = XX.X)
  Category Diversity:  ████████████████████ XX/100 (×0.20 = XX.X)
  Actionability:       ████████████████████ XX/100 (×0.25 = XX.X)

💡 Recommendations:
  1. [recommendation text]
  2. [recommendation text]
  3. [recommendation text]

📋 Summary: [1-2 sentence summary of strengths and most impactful improvements]

🔧 Suggested Rewrites: [only if Actionability < 70, show up to 3 rewrites]
  Before: "[original non-actionable rule text]"
  After:  "[rewritten with directive keyword]"
```

When analytics data IS available, replace "Specificity" with "Stale Rules" and "Completeness" with "Conversion Rate" in the display.

For the progress bars, use 20 characters total. Filled blocks (█) = `Math.round(score / 5)`, empty blocks (░) = `20 - filled`.

**IMPORTANT**: Always compute ALL 7 factors. NEVER use hardcoded penalty scores. When analytics data is missing, use Specificity and Completeness instead of Stale Rules and Conversion Rate — this ensures meaningful differentiation between projects.

If `.claudemd-lint/` directory doesn't exist at all, add a note after the dashboard:

```
ℹ️  Using content-based scoring (Specificity + Completeness) since no analytics data exists yet.
   Use Claude Code for 5+ sessions to unlock Stale Rules and Conversion Rate tracking.
```

The summary language follows the same rule as recommendations (step 16): match the primary language of the CLAUDE.md being analyzed.

If no CLAUDE.md files are found at all, display:

```
⚠️  No CLAUDE.md files found.
Run /claudemd-init to create one from a template.
```
