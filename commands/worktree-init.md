Initialize observational memory for a worktree by copying the main project's observations.

## Steps

1. Detect the main repository root:
   ```bash
   git rev-parse --show-toplevel
   ```
   Note: In a worktree, this returns the worktree's path, not the main repo. Use this to find the main repo:
   ```bash
   git rev-parse --git-common-dir
   ```
   The common git dir points to the main repo's `.git/` — the main project root is its parent.

2. Check that you are actually in a worktree (not the main repo):
   ```bash
   git rev-parse --git-dir
   git rev-parse --git-common-dir
   ```
   If these are the same, you're in the main repo — warn the user and stop.

3. Determine the main project's observations path:
   - Main project root: parent of the `--git-common-dir` path
   - Observations file: `<main-root>/.claude/observations.md`

4. Copy observations to the current worktree:
   - Create `.claude/` directory in the current worktree if it doesn't exist
   - Copy the main project's `observations.md` to `.claude/observations.md`
   - If the main project has no observations file, inform the user and suggest running `/observe-init` in the main project first

5. Report what was copied:
   - Source path
   - Destination path
   - Approximate size (line count or token estimate)
   - Current branch name

## Rules

- Do NOT modify the main project's observations file
- If `.claude/observations.md` already exists in the worktree, ask before overwriting
- After copying, confirm with a brief summary
