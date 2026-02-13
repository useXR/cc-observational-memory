Generate a pull request description from observations and branch history.

## Steps

1. **Gather context**:
   - Detect current branch: `git branch --show-current`
   - Run `git diff main...HEAD --stat` for file change summary
   - Run `git log main..HEAD --oneline` for commit history
   - If `main` doesn't work, try `master` as the base branch
   - Read `.claude/observations.md` for session context
   - Read `.claude/plans/<branch>.md` if it exists for planned intent

2. **Generate PR description** with these sections:

```markdown
## Summary
[1-3 sentences describing what this PR does and why, derived from observations and plan]

## Changes
[Bulleted list of key changes, grouped logically. Derived from git diff --stat and observations]

## Test Plan
- [ ] [Testing steps derived from the plan and observations]
- [ ] [Additional verification steps]

## Context
[Relevant observations: architecture decisions, trade-offs, things reviewers should know]
```

3. **Present the PR description** to the user for review

4. **Offer to create the PR**:
   - Ask: "Create this PR with `gh pr create`? (y/n)"
   - If yes, run: `gh pr create --title "<title>" --body "<body>"`
   - If the branch isn't pushed yet, suggest: `git push -u origin <branch>` first

5. **Record the PR** in observations:
   ```
   - [P1] (HH:MM) Created PR #<number> for <branch>: <title>
   ```

## Rules

- Derive the description from actual observations and git history, not generic templates
- Keep the summary concise — reviewers should understand the PR in 30 seconds
- If no observations exist, work from git log and diff only
- Do not push code or create the PR without user confirmation
- After presenting the PR description, wait for user input before proceeding
