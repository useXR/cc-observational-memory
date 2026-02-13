Record global (cross-project) observations about user preferences, workflows, and tools.

Global observations are stored at `~/.claude/observational-memory/observations-global.md` and injected into ALL projects at session start. Use this for information that applies everywhere, not just the current project.

## What Belongs in Global Observations

- **User preferences**: coding style, language preferences, tools, editor settings
- **Workflow patterns**: how the user likes to work, review process, deployment habits
- **Cross-project tools**: CLI tools, frameworks, services used across projects
- **Communication preferences**: verbosity, explanation depth, format preferences
- **Personal context**: timezone, role, team info (only if user has shared)

## What Does NOT Belong (use /observe instead)

- Project-specific architecture decisions
- Codebase details (file paths, function names, dependencies)
- Bug fixes or feature work in progress
- Project-specific conventions

## Steps

1. **Read existing global observations** from `~/.claude/observational-memory/observations-global.md`
   - If the file doesn't exist, create it

2. **Extract global-relevant observations** from the current session context:
   - User preferences and stated facts
   - Workflow patterns observed
   - Tool/technology preferences
   - Any cross-project context

3. **Append to the global file** using the standard format:

```
Date: YYYY-MM-DD
- [P1] (HH:MM) User preference or workflow observation
  - [P2] (HH:MM) Supporting detail
```

4. **After writing**, confirm: "Global observations updated at ~/.claude/observational-memory/observations-global.md"

## Rules

- Append to the existing file (do not overwrite)
- Do not duplicate observations already in the file
- When in doubt whether something is global or project-specific, use /observe (project) instead
- Use terse language to save tokens
- Aim for 3-8 observation lines
