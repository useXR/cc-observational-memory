You are performing a manual observation cycle. Extract observations from your current session context and append them to `.claude/observations.md`.

## What to Extract

**DISTINGUISH ASSERTIONS FROM QUESTIONS:**
- User TELLS you something → `[P1]` "User stated [fact]" (authoritative)
- User ASKS something → `[P2]` "User asked [question]"
- User assertions are the source of truth. A later question does not invalidate a prior assertion.

**STATE CHANGES:** When information updates or supersedes previous info, make it explicit:
- GOOD: "User will use new method (replacing old approach)"
- BAD: "User plans to use the new method"

**DETAILS TO ALWAYS PRESERVE:**
- Names, handles, identifiers (@username, file paths, package names)
- Numbers, counts, measurements
- Architecture decisions and their rationale
- Error messages and their resolutions
- Code snippets, commands, or configurations discussed
- What the user is working on and why
- User preferences (tools, style, approach)
- What worked and what did not

**WHEN ASSISTANT PROVIDES LISTS/RECOMMENDATIONS:**
Capture what distinguishes each item:
- GOOD: "Recommended: Library A (lightweight), Library B (full-featured)"
- BAD: "Recommended some libraries"

## Output Format

Append to `.claude/observations.md` using this exact format:

```
Date: YYYY-MM-DD
- [P1] (HH:MM) Important facts, decisions, or user assertions
  - [P2] (HH:MM) Supporting project details, tool results
  - [P3] (HH:MM) Minor details, uncertain observations
```

Priority levels: `[P1]` critical, `[P2]` moderate, `[P3]` informational.

After the observations, add:

```
Current Task: [What you are currently working on]
Suggested Next: [Specific hint for continuing in the next session]
```

## Rules

- **Append** to the existing file (do not overwrite prior observations)
- Aim for 5-15 observation lines per session chunk
- Use terse language to save tokens
- Do not repeat observations already in the file
- After writing, confirm briefly what you captured (one sentence)
