List all saved implementation plans and their progress.

## Steps

1. **Detect current branch**: Run `git branch --show-current`

2. **Find all plan files**:
   - Scan `.claude/plans/` directory recursively for `*.md` files
   - Also check for `.claude/plan.md` (legacy fallback)

3. **For each plan file**:
   - Extract branch name from the file path (e.g., `.claude/plans/feature/auth.md` → `feature/auth`)
   - Count completed steps: lines matching `[x]` (case insensitive)
   - Count pending steps: lines matching `[ ]`
   - Calculate total steps and completion percentage
   - Mark the current branch with `*`

4. **Display as a table**:

```
=== Implementation Plans ===

  Branch               Progress    Status
  ---                  ---         ---
* feature/auth         5/8 (62%)   in progress
  fix/login-bug        3/3 (100%)  complete
  main                 0/4 (0%)    not started

Legacy plan.md:        2/6 (33%)   in progress

Total: 3 plans (1 complete, 2 in progress)
```

## Rules

- Read-only operation — do not modify any files
- If no plans directory exists, say "No plans found"
- Sort: current branch first, then alphabetically
- After displaying, stop. No further commentary.
