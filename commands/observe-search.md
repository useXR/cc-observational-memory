Search observations across all known projects and global observations.

## Steps

1. **Get the search query**: The user should provide a search term after the command. If none provided, ask what to search for.

2. **Load project directories** from `~/.claude/observational-memory/config.json` field `projectDirs` (array of paths to projects that have used observational memory)

3. **Search each source**:
   - **Global observations**: `~/.claude/observational-memory/observations-global.md`
   - **Each project**: `<projectDir>/.claude/observations.md` and `<projectDir>/.claude/observations.local.md`
   - Perform case-insensitive search for the query
   - For each match, capture 2-3 lines of context (the matching line plus surrounding lines)

4. **Format results** grouped by source:

```
=== Search Results for "auth" ===

~/.claude/observational-memory/observations-global.md:
  - [P1] (14:30) User prefers JWT-based auth for all APIs

/home/user/project-a/.claude/observations.md:
  - [P1] (10:00) Implemented OAuth2 auth flow in src/auth/
  - [P2] (10:05) Using passport.js for auth middleware
  - [P1] (15:30) Auth refactored to use refresh tokens

/home/user/project-b/.claude/observations.md:
  - [P2] (09:00) Basic auth header validation in API gateway

4 matches across 3 sources
```

5. **Limit results** to 20 matches maximum. If more exist, note "... and N more matches"

## Rules

- Read-only operation — do not modify any files
- Case-insensitive search
- Skip projects whose observation files don't exist
- If no projectDirs configured, search only the current project and global observations
- After displaying results, stop. No further commentary.
