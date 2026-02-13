Display a specific branch plan with progress summary.

## Steps

1. **Determine which plan to show**:
   - If the user specified a branch name after the command, use that
   - Otherwise, detect current branch: `git branch --show-current`
   - Look for `.claude/plans/<branch>.md`
   - Fall back to `.claude/plan.md` if branch-specific plan not found

2. **Read the plan file** and display its full contents

3. **Show a progress summary** at the top:
   - Count `[x]` (completed) and `[ ]` (pending) steps
   - Show: "Progress: N/M steps (X%)"
   - If 100% complete, note "All steps completed — consider running /plan-clear"

4. **Display format**:

```
=== Plan: feature/auth (5/8 steps, 62%) ===

## Authentication System
1. [x] Set up JWT middleware
2. [x] Create login endpoint
3. [x] Add password hashing
4. [ ] Implement refresh tokens
5. [x] Add route guards
...
```

## Rules

- Read-only operation — do not modify any files
- If no plan found for the branch, say "No plan found for branch <name>"
- After displaying, stop. No further commentary.
