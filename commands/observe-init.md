You are bootstrapping observations for a project that already has development history. Generate an initial `.claude/observations.md` by analyzing the git commit history and project structure.

## Steps

1. Run `git log --oneline -50` to see recent commit history
2. Run `git log --stat -20` to understand what files changed and how much
3. Look at the project structure (list key directories and files)
4. Read key config files (package.json, tsconfig.json, Cargo.toml, pyproject.toml, etc.) to understand the stack
5. Read any existing documentation (README, CLAUDE.md, .claude/settings.json)
6. Optionally scan a few important source files to understand architecture

## What to Extract

From the commit history, infer:
- What the project does and its core architecture
- Technology stack and key dependencies
- Recent development focus (what areas are actively being worked on)
- Patterns in the codebase (testing approach, code style, directory structure)
- Any major refactors or pivots visible in the history
- Branch and collaboration patterns

## Output Format

Write to `.claude/observations.md` using this exact format:

```
Date: YYYY-MM-DD (bootstrapped from git history)
- [P1] (--:--) Project overview and purpose
  - [P2] (--:--) Core technology stack
  - [P2] (--:--) Key architectural decisions visible from structure
- [P1] (--:--) Active development areas (from recent commits)
  - [P2] (--:--) Specific files/modules being worked on
- [P2] (--:--) Project conventions and patterns
  - [P3] (--:--) Testing approach, build tools, etc.

Current Task: Unknown (bootstrapped from history)
Suggested Next: Review observations and start a conversation to build context
```

Use `(--:--)` for timestamps since these are inferred from history, not live observations.

## Rules

- Create the file (this is initialization, not appending)
- Be concise — aim for 15-30 observation lines
- Focus on information that would help a new session be productive immediately
- Use `{ref: DATE}` annotations for dates visible in the commit history
- Mark inferred/uncertain observations as `[P3]`
- After writing, summarize what you found
