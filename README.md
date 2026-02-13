# Observational Memory for Claude Code

Cross-session memory for Claude Code using hooks, inspired by [Mastra's observational memory](https://mastra.ai/blog/observational-memory) architecture. Claude extracts observations from its own context and injects them at the start of new sessions.

Zero dependencies. Node.js only. Works on Windows, macOS, and Linux.

## How It Works

Five hooks implement a two-phase Observer/Reflector pipeline:

1. **SessionStart** (`session-start.js`) — Reads observations from three sources (global, committed, local) and the active branch plan, then injects them into Claude's context via `additionalContext`. Also detects pending observations from previous sessions and auto-registers the project for cross-project search.

2. **Stop** (`stop-check.js`) — Fires every time Claude stops. Runs two checks in priority order:
   - **Observer phase**: Estimates new token count since the last observation. When the threshold is reached (default: 30,000 tokens), exits with code 2 and sends a specialized Observer prompt on stderr. Claude extracts structured observations from its own context and writes them to the appropriate files.
   - **Reflector phase**: If no observation is needed, checks the size of both `.claude/observations.md` and `.claude/observations.local.md`. When either exceeds the reflection threshold (default: 40,000 tokens), exits with code 2 and sends a Reflector prompt. Claude reads both files and consolidates them.

3. **PreCompact** (`pre-compact.js`) — Fires before context compaction. Sets a force flag so the next Stop triggers observation, ensuring context is captured before it's lost.

4. **SessionEnd** (`session-end.js`) — Fires when a session ends. If significant uncaptured activity exists (>5,000 tokens), writes a `.pending-observation` marker and sets the force flag. The next SessionStart will detect this and suggest running `/observe`.

5. **PostToolUse** (`post-tool-use.js`) — Fires after each tool use. Filters for significant tools (Write, Edit, Bash test/build/deploy, TaskCreate, TaskUpdate) and logs events to `.claude/.tool-events.json` (capped at 100). The Observer references this log for session activity.

Claude itself writes the observations — no external API calls, no extra cost beyond normal session usage.

### Observer vs. Reflector

| | Observer | Reflector |
|---|---|---|
| **Triggers when** | New transcript content exceeds `observationThreshold` | Either observations file exceeds `reflectionThreshold` |
| **Input** | Claude's current session context + tool event log | Both observation files (committed + local) |
| **Output** | Observations appended to appropriate files | Consolidated rewrite of both files |
| **Frequency** | Every ~30k tokens of conversation | After many observation cycles |
| **Purpose** | Capture facts, decisions, preferences | Condense, combine, drop redundant entries |

### Observation Files

Observations are split across three scopes:

| File | Scope | Contents |
|------|-------|----------|
| `.claude/observations.md` | Committed (project) | Architecture, conventions, tech stack, completed work |
| `.claude/observations.local.md` | Local (gitignored) | Session state, WIP, Current Task, Suggested Next |
| `~/.claude/observational-memory/observations-global.md` | Global (user) | Preferences, workflows, cross-project tools |

The Observer prompt instructs Claude to classify each observation into the correct file. When uncertain, it defaults to local (safer).

### Session Continuity

Each observation cycle also records:
- **Current Task**: What Claude was working on when observation fired (always local)
- **Suggested Next**: A specific hint for continuing in the next session (always local)

These are injected at session start, so Claude immediately knows where to pick up.

## Installation

```bash
cd cc-observational-memory
node scripts/install.js
```

This:
- Copies scripts to `~/.claude/observational-memory/`
- Merges hooks into `~/.claude/settings.json` (preserving existing hooks)
- Installs 13 slash commands to `~/.claude/commands/`
- Creates a default config at `~/.claude/observational-memory/config.json`

## Uninstallation

```bash
node scripts/uninstall.js                # Remove hooks only
node scripts/uninstall.js --remove-scripts  # Also remove scripts directory
```

Per-project `.claude/observations.md` files are preserved.

## Configuration

Global config at `~/.claude/observational-memory/config.json`:

```json
{
  "observationThreshold": 30000,
  "reflectionThreshold": 40000,
  "contextThresholdPct": 60,
  "enabled": true,
  "projectDirs": []
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `observationThreshold` | 30000 | Estimated new tokens before triggering the Observer (~4 chars/token) |
| `reflectionThreshold` | 40000 | When either observations file exceeds this, the Reflector consolidates |
| `contextThresholdPct` | 60 | Trigger observation when context window exceeds this % used |
| `enabled` | true | Global kill switch |
| `projectDirs` | [] | Auto-populated list of projects for cross-project search |

### Slash Commands

**Observation commands:**

| Command | Description |
|---------|-------------|
| `/observe` | Manually trigger an observation cycle |
| `/observe-init` | Bootstrap observations from git history for existing projects |
| `/observe-status` | Show system status: thresholds, token counts, plan progress |
| `/observe-diff` | Analyze recent git changes and record intent/reasoning observations |
| `/observe-pr` | Generate a PR description from observations and branch history |
| `/observe-global` | Record cross-project observations (preferences, workflows, tools) |
| `/observe-search` | Search observations across all known projects |
| `/observe-migrate` | Split existing observations into committed/local format |

**Plan management:**

| Command | Description |
|---------|-------------|
| `/plan-list` | List all saved plans and their progress |
| `/plan-show` | Display a specific branch plan with progress summary |
| `/plan-clear` | Find and clean up 100%-complete plans |

**Worktree support:**

| Command | Description |
|---------|-------------|
| `/worktree-init` | Copy main project's observations into a new worktree |
| `/worktree-merge` | Merge worktree observations back to main project |

### Worktree Workflow

```
1. Create worktree (git worktree add .worktrees/feature -b feature)
2. cd .worktrees/feature && run /worktree-init
3. Work on the feature (observations accumulate in the worktree)
4. Run /worktree-merge (integrates new observations back to main)
5. Finish branch (merge PR, remove worktree)
```

### Per-Project Opt-Out

Create `.claude/.no-observations` in any project to disable:

```bash
touch .claude/.no-observations
```

## Observation Format

Observations are stored as plain markdown:

```markdown
Date: 2026-02-11
- [P1] (14:30) User prefers TypeScript with strict mode
  - [P2] (14:30) Project uses Vite + React
  - [P3] (14:31) ESLint config extends @company/base
- [P1] (15:00) Decided to use PostgreSQL over SQLite for production
  - [P2] (15:00) Rationale: need concurrent writes from multiple services
- [P1] (15:30) API launch deadline is March 15th. {ref: 2026-03-15}
- [P2] (15:45) Sprint review moved to next Tuesday. {rel: 2026-02-18 from "next Tuesday"}

Current Task: Implementing database migration system
Suggested Next: Continue with migration CLI in src/cli/migrate.ts
```

Three-date model per observation:
1. **Observation date** — the `Date:` header (when the Observer ran)
2. **Referenced date** — `{ref: DATE}` when a specific date is mentioned in content
3. **Relative date** — `{rel: DATE from "expression"}` when a relative time expression is computed

Priority levels: `[P1]` critical, `[P2]` moderate, `[P3]` informational.

## File Structure

```
cc-observational-memory/
  scripts/
    session-start.js    # SessionStart hook — injects observations
    session-end.js      # SessionEnd hook — marks uncaptured activity
    stop-check.js       # Stop hook — Observer/Reflector gatekeeper
    pre-compact.js      # PreCompact hook — force-observation safety net
    post-tool-use.js    # PostToolUse hook — logs significant tool events
    prompts.js          # Observer and Reflector prompt templates
    transcript.js       # Transcript JSONL parser + token estimator
    config.js           # Configuration, state management, stdin reader
    install.js          # Installer
    uninstall.js        # Uninstaller
  commands/
    observe.md          # /observe — manual observation trigger
    observe-init.md     # /observe-init — bootstrap from git history
    observe-status.md   # /observe-status — system status display
    observe-diff.md     # /observe-diff — git diff analysis
    observe-pr.md       # /observe-pr — PR description generator
    observe-global.md   # /observe-global — cross-project observations
    observe-search.md   # /observe-search — cross-project search
    observe-migrate.md  # /observe-migrate — committed/local migration
    plan-list.md        # /plan-list — list all plans
    plan-show.md        # /plan-show — display specific plan
    plan-clear.md       # /plan-clear — clean up completed plans
    worktree-init.md    # /worktree-init — copy observations to worktree
    worktree-merge.md   # /worktree-merge — merge worktree back
  tests/
    test-lifecycle.js   # 43 lifecycle tests
  package.json
  README.md
```

Per-project (created automatically):
- `.claude/observations.md` — Committed observations (safe to share/commit)
- `.claude/observations.local.md` — Local observations (session state, gitignored)
- `.claude/.observer-state.json` — Position tracking (gitignore this)
- `.claude/.tool-events.json` — Tool event log (gitignore this)
- `.claude/.pending-observation` — SessionEnd marker (transient, auto-deleted)
- `.claude/plans/<branch>.md` — Branch-keyed implementation plans

Global (user-level):
- `~/.claude/observational-memory/config.json` — Global configuration
- `~/.claude/observational-memory/observations-global.md` — Cross-project observations

## Design Decisions

- **Two-phase pipeline**: Separate Observer and Reflector prompts (adapted from [Mastra's architecture](https://mastra.ai/research/observational-memory)). Observer extracts, Reflector consolidates — each fires on different stop events.
- **Node.js only**: Claude Code requires Node.js, so it's guaranteed available. No Python, no bash, no pip.
- **Zero dependencies**: Uses only Node.js built-ins (`fs`, `path`, `os`, `child_process`). No `npm install` needed.
- **Claude-as-observer**: Claude extracts observations from its own context. No external API calls.
- **Token-based thresholds**: Observation triggers based on estimated token count, not line count. A file paste counts proportionally to its size.
- **Three-scope observations**: Global (user preferences), committed (project facts), local (session state) — each stored separately for appropriate sharing and persistence.
- **Plain markdown**: All observation files are human-readable, editable, and can be committed or gitignored as needed.
- **User-level hooks**: Installed once in `~/.claude/settings.json`, works across all projects.
- **`[P1]`/`[P2]`/`[P3]` priorities**: Text labels instead of emoji to avoid encoding issues in cross-platform stderr.
- **PreCompact safety net**: Forces observation before context compaction — something Mastra's system doesn't have.
- **SessionEnd continuity**: Detects uncaptured session activity so the next session can prompt for observation.
- **Tool event log**: PostToolUse captures significant actions (file writes, test runs, failures) so the Observer has concrete activity data.
- **Auto-registration**: Projects are automatically added to `projectDirs` on session start, enabling cross-project search without manual setup.
