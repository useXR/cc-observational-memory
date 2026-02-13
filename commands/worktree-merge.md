Merge observations from the current worktree back into the main project's observations file.

Run this before finishing a branch or removing a worktree.

## Steps

1. Detect the main repository root:
   ```bash
   git rev-parse --git-common-dir
   ```
   The main project root is the parent of the common git dir.

2. Check that you are actually in a worktree (not the main repo):
   ```bash
   git rev-parse --git-dir
   git rev-parse --git-common-dir
   ```
   If these are the same, you're in the main repo — warn the user and stop.

3. Read both observation files:
   - **Worktree observations**: `.claude/observations.md` (current directory)
   - **Main observations**: `<main-root>/.claude/observations.md`

   If the worktree has no observations file, inform the user there's nothing to merge.

4. Identify what's new in the worktree by comparing the two files. The worktree started as a copy of main's observations, so entries that exist in the worktree but NOT in main are the new ones from branch work.

5. Integrate new observations into main's file following these rules:

   **DEDUPLICATION:**
   - Do not add observations that already exist in main (from other branches or sessions)
   - If both files updated the same observation differently, keep the more recent version

   **CONSOLIDATION:**
   - Apply the same priority rules as the Reflector:
     - `[P1]` = critical: always preserve
     - `[P2]` = moderate: preserve if still relevant
     - `[P3]` = informational: drop if redundant
   - Condense older entries, retain detail for recent ones
   - Preserve `{ref:}` and `{rel:}` temporal annotations

   **STRUCTURE:**
   - Maintain the dated event-log format
   - New entries from the worktree should be clearly dated
   - Update the `Current Task` and `Suggested Next` sections to reflect main's state after merge

   **PLAN CLEANUP:**
   - Check if `.claude/plans/<branch>.md` exists for the current branch
   - If the plan is fully completed (all steps `[x]`), note completion in observations and delete the plan file
   - If partially complete, leave the plan file in place

6. Write the merged result to the main project's `<main-root>/.claude/observations.md`

7. Report:
   - How many new observations were integrated
   - Whether any were deduplicated or consolidated
   - Whether the branch plan was cleaned up
   - Remind the user they can now safely remove the worktree

## Rules

- Do NOT delete or modify the worktree's observations file (leave it as-is for reference)
- Do NOT overwrite main's observations — this is a merge, not a replacement
- If main's observations file doesn't exist, just copy the worktree's file there
- After writing, confirm briefly what was merged
