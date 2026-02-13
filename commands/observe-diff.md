Analyze recent git changes and record observations about the intent and reasoning behind them.

## Steps

1. **Get the diff**:
   - Run `git diff HEAD` to see uncommitted changes
   - If no uncommitted changes, run `git diff HEAD~1` to see the last commit's changes
   - Also run `git log --oneline -5` for recent commit context

2. **Read current observations** from `.claude/observations.md` for existing context (avoid duplicating what's already recorded)

3. **Analyze the diff** for:
   - **Intent**: Why were these changes made? What problem do they solve?
   - **Architecture decisions**: New patterns, refactors, structural changes
   - **State changes**: What moved from one approach to another?
   - **Technical details worth preserving**: New dependencies, config changes, API changes
   - **Things that might break**: Side effects, removed functionality, changed interfaces
   - Do NOT just describe what lines changed — focus on the "why" and "what it means"

4. **Append observations** to `.claude/observations.md` using the standard format:

```
Date: YYYY-MM-DD
- [P1] (HH:MM) [intent/decision from the diff]
  - [P2] (HH:MM) [technical detail]
  - [P2] (HH:MM) [file/function affected]
```

5. **After writing**, display a brief summary of what was captured (one sentence).

## Rules

- Append to the existing file (do not overwrite prior observations)
- Focus on intent and reasoning, not line-by-line change descriptions
- Use terse language to save tokens
- Do not repeat observations already in the file
- If the diff is empty (no changes), say so and stop
- Aim for 3-8 observation lines per diff analysis
