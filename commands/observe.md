You are performing a manual observation cycle. Extract observations from your current session context and append them to `.claude/observations.md`.

## What to Extract

**DISTINGUISH ASSERTIONS FROM QUESTIONS:**
- User TELLS you something → `[P1]` "User stated [fact]" (authoritative)
- User ASKS something → `[P2]` "User asked [question]"
- User assertions are the source of truth. A later question does not invalidate a prior assertion.

**STATE CHANGES:** When information updates or supersedes previous info, make it explicit:
- GOOD: "User will use new method (replacing old approach)"
- BAD: "User plans to use the new method"

**TEMPORAL ANCHORING (three-date model):**
Each observation carries up to three dates:
1. **Observation date**: The `Date:` header (when the Observer ran) — always present
2. **Referenced date**: A specific date mentioned in the content — include when stated
3. **Relative date**: Computed actual date from relative expressions — include when computable

Examples:
- `(14:30) Deadline is March 15th for the API launch. {ref: 2026-03-15}`
- `(14:30) User will visit parents this weekend. {rel: Feb 15-16 from "this weekend"}`
- `(14:30) User prefers TypeScript with strict mode.` (no date reference needed)
- Do NOT compute dates for vague terms like "recently", "soon", "lately"

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

## Output Files

Observations are written to two files based on their nature:
- **`.claude/observations.md`** (committed): project facts, architecture, conventions, completed work
- **`.claude/observations.local.md`** (local): session state, WIP, Current Task, Suggested Next
- **`~/.claude/observational-memory/observations-global.md`** (global): user preferences, cross-project tools

When uncertain, default to local (safer). "Current Task" and "Suggested Next" ALWAYS go to local.

## Output Format

Append to the appropriate file(s) using this exact format:

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

## Plan Persistence

If there is an active implementation plan in context (numbered steps, task list, or phased approach):
- Detect the current branch: run `git branch --show-current`
- Write or update `.claude/plans/<branch-name>.md` with the full plan
  - Create the `.claude/plans/` directory if it does not exist
  - Example: on branch `feature/auth`, write to `.claude/plans/feature/auth.md`
- Mark completed steps with `[x]` and pending steps with `[ ]`
- Include enough detail that someone reading only the plan file can continue the work
- In observations, reference the plan: `[P1] Active plan in .claude/plans/<branch>.md — on step N of M`

## Rules

- **Append** to the existing file (do not overwrite prior observations)
- Aim for 5-15 observation lines per session chunk
- Use terse language to save tokens
- Do not repeat observations already in the file
- After writing, confirm briefly what you captured (one sentence)
