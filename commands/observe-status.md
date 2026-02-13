Display the current status of the observational memory system.

## Steps

1. **Read config** from `~/.claude/observational-memory/config.json`:
   - Show `observationThreshold`, `reflectionThreshold`, `contextThresholdPct`, `enabled`
   - If file missing, note defaults are in use

2. **Read observer state** from `.claude/.observer-state.json`:
   - Show `lastTokenCount` (tokens at last observation)
   - Show `forceObservation` flag
   - Calculate approximate tokens since last observation: current session activity vs `lastTokenCount`
   - Show percentage toward observation threshold: `(estimated new tokens / observationThreshold) * 100`

3. **Read observations file** `.claude/observations.md`:
   - Show file size in bytes and estimated tokens (`file.length / 4`)
   - Show percentage toward reflection threshold: `(obsTokens / reflectionThreshold) * 100`
   - Parse the last `Date:` line to show when the last observation was recorded
   - Count total observation lines (lines starting with `- [P`)

4. **Check for global observations** at `~/.claude/observational-memory/observations-global.md`:
   - If exists, show file size and estimated tokens
   - If not, note "No global observations yet"

5. **Check active plan**:
   - Detect current branch: `git branch --show-current`
   - Look for `.claude/plans/<branch>.md`, fall back to `.claude/plan.md`
   - If found, count `[x]` (completed) and `[ ]` (pending) steps
   - Show progress: "Plan progress: N/M steps completed (X%)"

6. **Check for local observations** at `.claude/observations.local.md`:
   - If exists, show file size and estimated tokens

7. **Format output** as a clean status display:

```
=== Observational Memory Status ===

Config:
  Observation threshold: 30,000 tokens
  Reflection threshold:  40,000 tokens
  Context threshold:     60%
  Enabled:               yes

Observer State:
  Tokens at last observation: 25,000
  Force observation:          no
  Estimated new tokens:       ~8,000 (27% toward threshold)

Observations (.claude/observations.md):
  File size:            12,450 tokens (31% toward reflection)
  Last observation:     2026-02-13
  Total entries:        42

Global Observations:
  File size:            3,200 tokens

Active Plan (feature/auth):
  Progress:             5/8 steps (62%)

Local Observations:
  (none)
```

## Rules

- Read-only operation — do not modify any files
- If any file is missing, show a reasonable "not found" or "none" message
- Use the token estimation formula: `Math.ceil(text.length / 4)`
- After displaying, stop. No further commentary.
