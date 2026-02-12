# Observational Memory for Claude Code

Cross-session memory for Claude Code using hooks, inspired by [Mastra's observational memory](https://mastra.ai/blog/observational-memory) architecture. Claude extracts observations from its own context and injects them at the start of new sessions.

Zero dependencies. Node.js only. Works on Windows, macOS, and Linux.

## How It Works

Three hooks implement a two-phase Observer/Reflector pipeline:

1. **SessionStart** (`session-start.js`) — Reads `.claude/observations.md` from the current project and injects it into Claude's context via `additionalContext`. Fires on `startup` and `resume`.

2. **Stop** (`stop-check.js`) — Fires every time Claude stops. Runs two checks in priority order:
   - **Observer phase**: Estimates new token count since the last observation. When the threshold is reached (default: 30,000 tokens), exits with code 2 and sends a specialized Observer prompt on stderr. Claude extracts structured observations from its own context and appends them to `.claude/observations.md`.
   - **Reflector phase**: If no observation is needed, checks the size of `.claude/observations.md`. When it exceeds the reflection threshold (default: 40,000 tokens), exits with code 2 and sends a Reflector prompt. Claude reads the file and consolidates it — combining related items, condensing old entries, dropping superseded context — while preserving all critical information.

3. **PreCompact** (`pre-compact.js`) — Fires before context compaction. Sets a force flag so the next Stop triggers observation, ensuring context is captured before it's lost.

Claude itself writes the observations — no external API calls, no extra cost beyond normal session usage.

### Observer vs. Reflector

| | Observer | Reflector |
|---|---|---|
| **Triggers when** | New transcript content exceeds `observationThreshold` | `observations.md` exceeds `reflectionThreshold` |
| **Input** | Claude's current session context | Existing `observations.md` file |
| **Output** | New observations appended to file | Consolidated rewrite of entire file |
| **Frequency** | Every ~30k tokens of conversation | After many observation cycles |
| **Purpose** | Capture facts, decisions, preferences | Condense, combine, drop redundant entries |

### Session Continuity

Each observation cycle also records:
- **Current Task**: What Claude was working on when observation fired
- **Suggested Next**: A specific hint for continuing in the next session

These are injected at session start, so Claude immediately knows where to pick up.

## Installation

```bash
cd cc-observational-memory
node scripts/install.js
```

This:
- Copies scripts to `~/.claude/observational-memory/`
- Merges hooks into `~/.claude/settings.json` (preserving existing hooks)
- Installs the `/observe` slash command to `~/.claude/commands/`
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
  "enabled": true
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `observationThreshold` | 30000 | Estimated new tokens before triggering the Observer (~4 chars/token) |
| `reflectionThreshold` | 40000 | When observations.md exceeds this, the Reflector consolidates |
| `enabled` | true | Global kill switch |

### Manual Observation (`/observe`)

Type `/observe` in any session to manually trigger an observation cycle. Use this before running `/compact` or `/clear` to capture observations from the full, uncompacted context.

The automatic PreCompact hook also sets a force-observation flag, but the actual extraction happens *after* compaction. `/observe` lets you capture from the complete context first.

### Per-Project Opt-Out

Create `.claude/.no-observations` in any project to disable:

```bash
touch .claude/.no-observations
```

## Observation Format

Observations are stored as plain markdown in `.claude/observations.md`:

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
    stop-check.js       # Stop hook — Observer/Reflector gatekeeper
    pre-compact.js      # PreCompact hook — force-observation safety net
    prompts.js          # Observer and Reflector prompt templates
    transcript.js       # Transcript JSONL parser + token estimator
    config.js           # Configuration, state management, stdin reader
    install.js          # Installer
    uninstall.js        # Uninstaller
  commands/
    observe.md          # /observe slash command
  package.json
  README.md
```

Per-project (created automatically):
- `.claude/observations.md` — Human-readable observations
- `.claude/.observer-state.json` — Position tracking (gitignore this)

## Design Decisions

- **Two-phase pipeline**: Separate Observer and Reflector prompts (adapted from [Mastra's architecture](https://mastra.ai/research/observational-memory)). Observer extracts, Reflector consolidates — each fires on different stop events.
- **Node.js only**: Claude Code requires Node.js, so it's guaranteed available. No Python, no bash, no pip.
- **Zero dependencies**: Uses only Node.js built-ins (`fs`, `path`, `os`). No `npm install` needed.
- **Claude-as-observer**: Claude extracts observations from its own context. No external API calls.
- **Token-based thresholds**: Observation triggers based on estimated token count, not line count. A file paste counts proportionally to its size.
- **Plain markdown**: `.claude/observations.md` is human-readable, editable, and can be committed or gitignored.
- **User-level hooks**: Installed once in `~/.claude/settings.json`, works across all projects.
- **`[P1]`/`[P2]`/`[P3]` priorities**: Text labels instead of emoji to avoid encoding issues in cross-platform stderr.
- **PreCompact safety net**: Forces observation before context compaction — something Mastra's system doesn't have.
