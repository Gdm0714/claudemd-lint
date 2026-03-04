---
description: Analyze the current conversation to detect corrections, preferences, and directives that should become CLAUDE.md rules
allowed-tools: Read, Edit, Glob, Bash
---

# Detect Corrections from Conversation

You are analyzing the current conversation to find user corrections, preferences, and directives that the regex-based auto-detection may have missed. This provides language-agnostic, context-aware detection.

## Step 1: Analyze Conversation

Review the entire conversation history and identify messages where the user:

1. **Corrected your behavior** — "그렇게 하지 말고", "that's not what I meant", "아니 그게 아니라"
2. **Stated a preference** — "나는 ~가 좋아", "I prefer", "~로 해줘"
3. **Gave a directive** — "앞으로는 ~해", "from now on", "다음부터는"
4. **Expressed frustration about repeated mistakes** — "또 그러네", "왜 자꾸", "I keep telling you"
5. **Specified a convention** — "우리 프로젝트에서는 ~", "in this project we", "컨벤션은 ~"
6. **Rejected an approach** — "그 방법 말고", "don't do it that way", "그건 아닌데"

## Step 2: Extract Rules

For each detected correction, extract:
- **Rule text**: A clear, actionable directive (e.g., "Always use single quotes for strings")
- **Category**: `style`, `convention`, `behavior`, `workflow`, `tool`, or `general`
- **Confidence**: `high` (explicit directive), `medium` (implied preference), `low` (possible correction)
- **Original message**: The user's exact words that led to this rule
- **Language**: The language the rule should be written in (match the user's CLAUDE.md language)

## Step 3: Check for Duplicates

1. Read the existing CLAUDE.md (use Glob to find `**/CLAUDE.md`)
2. Read `.claudemd-lint/suggestions.json` if it exists
3. Skip any rule that already exists in CLAUDE.md or pending suggestions
4. Skip vague or one-time corrections (e.g., "fix this typo" — not a recurring rule)

## Step 4: Present Findings

If corrections found, present them:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Detected Corrections (LLM Analysis)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found N corrections in this conversation:

#1 [high confidence] (category: style)
   Rule: "Always use single quotes for strings"
   From: "작은따옴표 쓰라고 했잖아"

#2 [medium confidence] (category: convention)
   Rule: "Use kebab-case for all filenames"
   From: "파일명은 케밥케이스로 해줘"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

For each correction, ask: **Add to CLAUDE.md / Save as suggestion / Skip?**

## Step 5: Apply

### Add to CLAUDE.md:
1. Find the most appropriate section in CLAUDE.md
2. Add the rule as a bullet point
3. Confirm the change to the user

### Save as suggestion:
1. Read `.claudemd-lint/suggestions.json` (or create `[]` if missing)
2. Append:
```json
{
  "id": "<uuid>",
  "ruleText": "the rule",
  "category": "style",
  "confidence": 0.9,
  "source": "llm-detect",
  "corrections": [{"message": "original user message", "timestamp": <now>}],
  "status": "pending",
  "createdAt": <now>
}
```
3. Write back to `.claudemd-lint/suggestions.json`

### Skip:
- Do nothing, move to next

## Step 6: Summary

```
Detection Complete
   Added to CLAUDE.md: N rules
   Saved as suggestions: N rules
   Skipped: N
   Already existed: N
```

## Important Notes
- This command uses YOUR understanding of the conversation — no regex limitations
- Works with any language (Korean, English, Japanese, etc.)
- Focus on **recurring patterns and explicit directives**, not one-time requests
- Never add rules without user confirmation
- If no corrections found, say so and suggest the user run this at session end when there's more context
