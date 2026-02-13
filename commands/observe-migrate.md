Migrate existing observations into the committed/local split format.

This command reads `.claude/observations.md` and splits it into two files:
- `.claude/observations.md` — **Committed**: project facts, architecture, conventions (safe to commit)
- `.claude/observations.local.md` — **Local**: session state, WIP notes, Current Task/Suggested Next (gitignored)

## Classification Rules

**Goes to COMMITTED (observations.md)**:
- Architecture decisions and rationale
- Project conventions and patterns
- Technology stack and dependencies
- User preferences relevant to the project
- Completed feature descriptions
- Bug fixes and their root causes
- Configuration and setup notes
- API contracts and interfaces

**Goes to LOCAL (observations.local.md)**:
- `Current Task:` and `Suggested Next:` lines (ALWAYS local)
- Work in progress notes
- Session-specific debugging context
- Temporary state ("currently blocked on...", "waiting for...")
- File paths being actively edited
- Partial implementations not yet complete

## Steps

1. **Create backup**: Copy `.claude/observations.md` to `.claude/observations.md.backup`

2. **Read the observations file** and classify each entry:
   - Parse by date groups and individual observation lines
   - Apply the classification rules above
   - When uncertain, default to LOCAL (safer — can always be moved to committed later)

3. **Write the split files**:
   - Write committed observations to `.claude/observations.md`
   - Write local observations to `.claude/observations.local.md`
   - Preserve the date headers, priority levels, and temporal annotations

4. **Suggest gitignore update**:
   - Check if `.gitignore` already contains `observations.local.md`
   - If not, suggest adding `.claude/observations.local.md` to `.gitignore`

5. **Report results**:
   ```
   Migration complete:
     Committed: 25 entries → .claude/observations.md
     Local:     8 entries  → .claude/observations.local.md
     Backup:    .claude/observations.md.backup

   Consider adding to .gitignore:
     .claude/observations.local.md
   ```

## Rules

- ALWAYS create a backup before modifying
- When uncertain, classify as LOCAL (safer default)
- `Current Task` and `Suggested Next` ALWAYS go to local
- Preserve all date headers and formatting
- Do not lose any observations — every line must end up in one of the two files
- After migration, stop. No further commentary.
