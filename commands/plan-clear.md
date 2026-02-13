Find and clean up completed implementation plans.

## Steps

1. **Scan for completed plans**:
   - Read all `.claude/plans/*.md` files (recursively)
   - Also check `.claude/plan.md`
   - For each, count `[x]` and `[ ]` steps
   - Identify plans where ALL steps are `[x]` (100% complete)

2. **Show what was found**:

```
=== Completed Plans ===

  feature/auth      8/8 steps (100%)
  fix/login-bug     3/3 steps (100%)

2 completed plans found.
```

3. **Confirm with the user** before deleting:
   - "Delete these completed plan files? (y/n)"
   - Only proceed if the user confirms

4. **For each confirmed deletion**:
   - Delete the plan file
   - Record in `.claude/observations.md`:
     ```
     Date: YYYY-MM-DD
     - [P2] (HH:MM) Cleaned up completed plan for <branch> (N steps, all done)
     ```

5. **If no completed plans found**, say "No completed plans found" and stop.

## Rules

- ALWAYS confirm before deleting
- Only delete plans where 100% of steps are marked `[x]`
- Record the cleanup in observations for audit trail
- If the plans directory becomes empty after cleanup, leave it (don't delete the directory)
- After cleanup, stop. No further commentary.
