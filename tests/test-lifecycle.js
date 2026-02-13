'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var childProcess = require('child_process');

// Use installed scripts (what Claude Code actually runs)
var SCRIPT_DIR = path.join(os.homedir(), '.claude', 'observational-memory');

// Temp project directory
var tmpDir = path.join(os.tmpdir(), 'obs-mem-test-' + Date.now());
var claudeDir = path.join(tmpDir, '.claude');
fs.mkdirSync(claudeDir, { recursive: true });

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL: ' + name + ' — ' + e.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function runHook(script, inputObj) {
  var input = JSON.stringify(inputObj);
  var result = childProcess.spawnSync('node', [path.join(SCRIPT_DIR, script)], {
    input: input,
    encoding: 'utf8',
    timeout: 10000,
    cwd: tmpDir
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

// Generate a fake transcript JSONL with ~N tokens of content
function generateTranscript(tokenCount) {
  var lines = [];
  var tokensPerLine = 50; // ~200 chars per line / 4
  var numLines = Math.ceil(tokenCount / tokensPerLine);
  for (var i = 0; i < numLines; i++) {
    var text = 'This is test message number ' + i + ' with some padding content to reach the token target. ';
    text += 'Additional words to fill space: alpha beta gamma delta epsilon zeta eta theta iota kappa. ';
    text += 'More content: lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega complete.';
    var entry = {
      type: i % 2 === 0 ? 'user' : 'assistant',
      timestamp: new Date().toISOString(),
      message: {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: [{ type: 'text', text: text }]
      }
    };
    lines.push(JSON.stringify(entry));
  }
  // Also add some non-content lines (progress events, tool_use)
  lines.push(JSON.stringify({ type: 'progress', message: null }));
  lines.push(JSON.stringify({
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'test', name: 'Read', input: {} }]
    }
  }));
  return lines.join('\n');
}

var transcriptPath = path.join(tmpDir, 'transcript.jsonl');

// ==========================================
console.log('\n=== TEST 1: SessionStart — no observations file ===');
// ==========================================

test('exits 0, no output when no observations.md', function () {
  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);
  assert(r.stdout.trim() === '', 'Expected no stdout, got: ' + r.stdout);
});

// ==========================================
console.log('\n=== TEST 2: SessionStart — with observations ===');
// ==========================================

var sampleObs = [
  'Date: 2026-02-11',
  '- [P1] (10:00) User prefers TypeScript',
  '  - [P2] (10:00) Project uses React + Vite',
  '',
  'Current Task: Building auth system',
  'Suggested Next: Continue with JWT middleware'
].join('\n');

fs.writeFileSync(path.join(claudeDir, 'observations.md'), sampleObs);

test('injects observations on startup', function () {
  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);
  var output = JSON.parse(r.stdout);
  assert(output.hookSpecificOutput, 'Missing hookSpecificOutput');
  assert(output.hookSpecificOutput.additionalContext.indexOf('previous sessions') !== -1,
    'Expected startup preamble');
  assert(output.hookSpecificOutput.additionalContext.indexOf('User prefers TypeScript') !== -1,
    'Observations not included');
});

test('injects observations on compact with correct preamble', function () {
  var r = runHook('session-start.js', { cwd: tmpDir, source: 'compact' });
  var output = JSON.parse(r.stdout);
  assert(output.hookSpecificOutput.additionalContext.indexOf('just compacted') !== -1,
    'Expected compact preamble');
  assert(output.hookSpecificOutput.additionalContext.indexOf('ONLY memory') !== -1,
    'Expected ONLY memory emphasis');
});

test('injects observations on clear with correct preamble', function () {
  var r = runHook('session-start.js', { cwd: tmpDir, source: 'clear' });
  var output = JSON.parse(r.stdout);
  assert(output.hookSpecificOutput.additionalContext.indexOf('just cleared') !== -1,
    'Expected clear preamble');
});

test('injects branch-keyed plan when present', function () {
  // Detect actual branch in the temp dir (or use fallback plan.md)
  var planContent = '## Plan\n1. [x] Step one\n2. [ ] Step two\n3. [ ] Step three';

  // Test fallback to plan.md (temp dir is not a git repo)
  fs.writeFileSync(path.join(claudeDir, 'plan.md'), planContent);
  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  var output = JSON.parse(r.stdout);
  var ctx = output.hookSpecificOutput.additionalContext;
  assert(ctx.indexOf('<active-plan') !== -1, 'Expected active-plan tag');
  assert(ctx.indexOf('Step two') !== -1, 'Expected plan content');
  assert(ctx.indexOf('Continue from where it left off') !== -1, 'Expected plan preamble');
  fs.unlinkSync(path.join(claudeDir, 'plan.md'));
});

test('injects plan from .claude/plans/<branch>.md', function () {
  // Initialize a git repo in temp dir so branch detection works
  childProcess.execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  childProcess.execSync('git checkout -b test-feature', { cwd: tmpDir, stdio: 'pipe' });

  var plansDir = path.join(claudeDir, 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  var planContent = '## Feature Plan\n1. [x] Setup\n2. [ ] Implement\n3. [ ] Test';
  fs.writeFileSync(path.join(plansDir, 'test-feature.md'), planContent);

  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  var output = JSON.parse(r.stdout);
  var ctx = output.hookSpecificOutput.additionalContext;
  assert(ctx.indexOf('<active-plan branch="test-feature"') !== -1, 'Expected branch in tag');
  assert(ctx.indexOf('Implement') !== -1, 'Expected plan content');

  // Cleanup
  fs.rmSync(plansDir, { recursive: true });
  fs.rmSync(path.join(tmpDir, '.git'), { recursive: true });
});

test('no plan tag when plan file absent', function () {
  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  var output = JSON.parse(r.stdout);
  var ctx = output.hookSpecificOutput.additionalContext;
  assert(ctx.indexOf('<active-plan') === -1, 'Should not have active-plan tag');
});

// ==========================================
console.log('\n=== TEST 3: Stop hook — stop_hook_active guard ===');
// ==========================================

test('exits 0 immediately when stop_hook_active is true', function () {
  var r = runHook('stop-check.js', {
    cwd: tmpDir,
    transcript_path: transcriptPath,
    stop_hook_active: true
  });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);
  assert(r.stderr.trim() === '', 'Expected no stderr');
});

// ==========================================
console.log('\n=== TEST 4: Stop hook — under threshold ===');
// ==========================================

// Write a small transcript (~5k tokens, well under 30k)
fs.writeFileSync(transcriptPath, generateTranscript(5000));

test('exits 0 when under observation threshold', function () {
  // Reset state
  var statePath = path.join(claudeDir, '.observer-state.json');
  if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);
  assert(r.stderr.trim() === '', 'Expected no stderr');
});

test('state file created with token count', function () {
  var state = JSON.parse(fs.readFileSync(path.join(claudeDir, '.observer-state.json'), 'utf8'));
  assert(state.lastTokenCount > 0, 'Expected lastTokenCount > 0, got ' + state.lastTokenCount);
  assert(state.forceObservation === false, 'Expected forceObservation false');
});

// ==========================================
console.log('\n=== TEST 5: Stop hook — over threshold (Observer) ===');
// ==========================================

// Write a large transcript (~35k tokens)
fs.writeFileSync(transcriptPath, generateTranscript(35000));

test('exits 2 with Observer prompt when threshold exceeded', function () {
  // Reset state to simulate fresh start
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 0, lastTokenCount: 0, forceObservation: false }));

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 2, 'Expected exit 2, got ' + r.exitCode);
  assert(r.stderr.indexOf('<observation-request>') !== -1, 'Expected Observer prompt in stderr');
  assert(r.stderr.indexOf('observation cycle') !== -1, 'Expected observation cycle text');
  assert(r.stderr.indexOf('You can /clear') !== -1, 'Expected /clear reminder in prompt');
});

test('state updated after observation trigger', function () {
  var state = JSON.parse(fs.readFileSync(path.join(claudeDir, '.observer-state.json'), 'utf8'));
  assert(state.lastTokenCount > 30000, 'Expected lastTokenCount > 30000, got ' + state.lastTokenCount);
  assert(state.forceObservation === false, 'forceObservation should be reset');
});

// ==========================================
console.log('\n=== TEST 6: Stop hook — second stop after observation (rolling window) ===');
// ==========================================

test('exits 0 on immediate re-run (no new content)', function () {
  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 0, 'Expected exit 0 (no new content), got ' + r.exitCode);
});

// ==========================================
console.log('\n=== TEST 7: Stop hook — rolling window triggers at 60k ===');
// ==========================================

test('triggers again when transcript grows another 30k', function () {
  // Grow transcript to ~65k tokens
  fs.writeFileSync(transcriptPath, generateTranscript(65000));

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 2, 'Expected exit 2 at ~65k, got ' + r.exitCode);
  assert(r.stderr.indexOf('<observation-request>') !== -1, 'Expected Observer prompt');
});

// ==========================================
console.log('\n=== TEST 8: PreCompact — force flag ===');
// ==========================================

test('sets forceObservation flag', function () {
  // Reset state
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 0, lastTokenCount: 50000, forceObservation: false }));

  var r = runHook('pre-compact.js', { cwd: tmpDir });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);

  var state = JSON.parse(fs.readFileSync(path.join(claudeDir, '.observer-state.json'), 'utf8'));
  assert(state.forceObservation === true, 'Expected forceObservation to be true');
});

test('Stop hook triggers Observer when forceObservation is set (even under threshold)', function () {
  // Small transcript, but force flag is set
  fs.writeFileSync(transcriptPath, generateTranscript(5000));
  // State has forceObservation=true, lastTokenCount=50000 (higher than transcript)
  // newTokens will be negative, but forceObservation overrides

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 2, 'Expected exit 2 (forced), got ' + r.exitCode);
  assert(r.stderr.indexOf('<observation-request>') !== -1, 'Expected Observer prompt');
});

// ==========================================
console.log('\n=== TEST 8b: Context window threshold ===');
// ==========================================

test('triggers Observer when context window exceeds threshold even with low content tokens', function () {
  // Create a small transcript with usage data showing 130k/200k context (65%)
  var lines = [];
  // A few user/assistant messages (low content tokens)
  for (var i = 0; i < 5; i++) {
    lines.push(JSON.stringify({
      type: i % 2 === 0 ? 'user' : 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: i % 2 === 0 ? 'user' : 'assistant', content: [{ type: 'text', text: 'Short message ' + i }] }
    }));
  }
  // Add an assistant entry with high usage (65% of 200k)
  lines.push(JSON.stringify({
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
    usage: {
      input_tokens: 50000,
      cache_creation_input_tokens: 40000,
      cache_read_input_tokens: 40000,
      output_tokens: 500
    }
  }));
  fs.writeFileSync(transcriptPath, lines.join('\n'));

  // State: no force, content tokens already tracked (so newTokens is small but > 0)
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 0, lastTokenCount: 0, forceObservation: false }));

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 2, 'Expected exit 2 (context threshold), got ' + r.exitCode);
  assert(r.stderr.indexOf('<observation-request>') !== -1, 'Expected Observer prompt');
});

test('does not trigger when context is under threshold', function () {
  // Same transcript but usage showing only 30% context
  var lines = [];
  lines.push(JSON.stringify({
    type: 'user',
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
  }));
  lines.push(JSON.stringify({
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
    usage: {
      input_tokens: 20000,
      cache_creation_input_tokens: 20000,
      cache_read_input_tokens: 20000,
      output_tokens: 100
    }
  }));
  fs.writeFileSync(transcriptPath, lines.join('\n'));

  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 0, lastTokenCount: 0, forceObservation: false }));

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 0, 'Expected exit 0 (under context threshold), got ' + r.exitCode);
});

// ==========================================
console.log('\n=== TEST 9: Stop hook — Reflector phase ===');
// ==========================================

test('triggers Reflector when observations.md exceeds reflection threshold', function () {
  // Reset state (no force, no new tokens to trigger Observer)
  fs.writeFileSync(transcriptPath, generateTranscript(5000));
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 999, lastTokenCount: 99999, forceObservation: false }));

  // Write a huge observations.md (~45k tokens = ~180k chars)
  var bigObs = '';
  for (var i = 0; i < 3000; i++) {
    bigObs += '- [P2] (10:' + (i % 60).toString().padStart(2, '0') + ') Observation entry number ' + i + ' with some context\n';
  }
  fs.writeFileSync(path.join(claudeDir, 'observations.md'), bigObs);

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 2, 'Expected exit 2 (Reflector), got ' + r.exitCode);
  assert(r.stderr.indexOf('<reflection-request>') !== -1, 'Expected Reflector prompt in stderr');
  assert(r.stderr.indexOf('consolidation') !== -1, 'Expected consolidation text');
});

// ==========================================
console.log('\n=== TEST 10: Per-project opt-out ===');
// ==========================================

test('all hooks skip when .no-observations exists', function () {
  fs.writeFileSync(path.join(claudeDir, '.no-observations'), '');

  // SessionStart
  var r1 = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  assert(r1.exitCode === 0, 'SessionStart should exit 0');
  assert(r1.stdout.trim() === '', 'SessionStart should produce no output');

  // Stop (with forceObservation)
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 0, lastTokenCount: 0, forceObservation: true }));
  var r2 = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r2.exitCode === 0, 'Stop should exit 0');
  assert(r2.stderr.trim() === '', 'Stop should produce no stderr');

  // PreCompact
  var r3 = runHook('pre-compact.js', { cwd: tmpDir });
  assert(r3.exitCode === 0, 'PreCompact should exit 0');

  // Cleanup
  fs.unlinkSync(path.join(claudeDir, '.no-observations'));
});

// ==========================================
console.log('\n=== TEST 11: No transcript_path ===');
// ==========================================

test('Stop hook exits 0 when no transcript_path provided', function () {
  var r = runHook('stop-check.js', { cwd: tmpDir });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);
});

// ==========================================
console.log('\n=== TEST 12: SessionStart — global observations ===');
// ==========================================

// Create a global observations file
var globalDir = path.join(os.homedir(), '.claude', 'observational-memory');
var globalObsPath = path.join(globalDir, 'observations-global.md');
var globalObsBackup = null;

// Backup existing global observations if present
try {
  globalObsBackup = fs.readFileSync(globalObsPath, 'utf8');
} catch (e) { /* no existing file */ }

test('injects global observations alongside project observations', function () {
  // Write global observations
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(globalObsPath, 'Date: 2026-02-12\n- [P1] (09:00) User prefers dark mode everywhere');

  // Ensure project observations exist
  fs.writeFileSync(path.join(claudeDir, 'observations.md'), sampleObs);

  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);
  var output = JSON.parse(r.stdout);
  var ctx = output.hookSpecificOutput.additionalContext;
  assert(ctx.indexOf('<global-context>') !== -1, 'Expected global-context tag');
  assert(ctx.indexOf('dark mode') !== -1, 'Expected global observation content');
  assert(ctx.indexOf('<project-context>') !== -1, 'Expected project-context tag');
  assert(ctx.indexOf('User prefers TypeScript') !== -1, 'Expected project observation content');
});

test('Observer prompt mentions global observation distinction', function () {
  // Read prompts.js and check it includes the global section
  var promptsContent = fs.readFileSync(path.join(SCRIPT_DIR, 'prompts.js'), 'utf8');
  assert(promptsContent.indexOf('PROJECT VS GLOBAL') !== -1, 'Expected global distinction in Observer prompt');
  assert(promptsContent.indexOf('observations-global.md') !== -1, 'Expected global file path in prompt');
});

// Restore global observations
if (globalObsBackup !== null) {
  fs.writeFileSync(globalObsPath, globalObsBackup);
} else {
  try { fs.unlinkSync(globalObsPath); } catch (e) { /* ok */ }
}

// ==========================================
console.log('\n=== TEST 13: SessionEnd hook ===');
// ==========================================

test('sets force flag and pending marker when activity detected', function () {
  // Write a transcript with >5k tokens
  fs.writeFileSync(transcriptPath, generateTranscript(8000));
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 0, lastTokenCount: 0, forceObservation: false }));

  var r = runHook('session-end.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 0, 'Expected exit 0, got ' + r.exitCode);

  // Check pending marker
  var pendingPath = path.join(claudeDir, '.pending-observation');
  assert(fs.existsSync(pendingPath), 'Expected .pending-observation marker');
  var pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  assert(pending.newTokens > 5000, 'Expected newTokens > 5000, got ' + pending.newTokens);
  assert(pending.reason === 'session_end', 'Expected reason session_end');

  // Check force flag
  var state = JSON.parse(fs.readFileSync(path.join(claudeDir, '.observer-state.json'), 'utf8'));
  assert(state.forceObservation === true, 'Expected forceObservation true');
});

test('SessionEnd skips when under threshold', function () {
  // Write a tiny transcript (~2k tokens)
  fs.writeFileSync(transcriptPath, generateTranscript(2000));
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 0, lastTokenCount: 0, forceObservation: false }));

  // Remove any existing pending marker
  var pendingPath = path.join(claudeDir, '.pending-observation');
  try { fs.unlinkSync(pendingPath); } catch (e) { /* ok */ }

  var r = runHook('session-end.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 0, 'Expected exit 0');
  assert(!fs.existsSync(pendingPath), 'Should not create pending marker for small session');
});

test('SessionStart detects pending marker and suggests /observe', function () {
  // Create a pending observation marker
  fs.writeFileSync(path.join(claudeDir, '.pending-observation'),
    JSON.stringify({ reason: 'session_end', timestamp: new Date().toISOString(), newTokens: 12000 }));

  // Ensure observations exist
  fs.writeFileSync(path.join(claudeDir, 'observations.md'), sampleObs);

  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  assert(r.exitCode === 0, 'Expected exit 0');
  var output = JSON.parse(r.stdout);
  var ctx = output.hookSpecificOutput.additionalContext;
  assert(ctx.indexOf('uncaptured activity') !== -1, 'Expected uncaptured activity note');
  assert(ctx.indexOf('/observe') !== -1, 'Expected /observe suggestion');

  // Marker should be deleted
  assert(!fs.existsSync(path.join(claudeDir, '.pending-observation')),
    'Pending marker should be deleted after SessionStart');
});

// ==========================================
console.log('\n=== TEST 14: PostToolUse event capture ===');
// ==========================================

test('captures Write event', function () {
  // Remove existing events
  var eventsPath = path.join(claudeDir, '.tool-events.json');
  try { fs.unlinkSync(eventsPath); } catch (e) { /* ok */ }

  var r = runHook('post-tool-use.js', {
    cwd: tmpDir,
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/test/src/index.ts' },
    tool_response: 'File written',
    tool_use_id: 'tu_123'
  });
  assert(r.exitCode === 0, 'Expected exit 0');
  assert(fs.existsSync(eventsPath), 'Expected .tool-events.json to be created');
  var events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  assert(Array.isArray(events), 'Expected events array');
  assert(events.length === 1, 'Expected 1 event, got ' + events.length);
  assert(events[0].tool === 'Write', 'Expected tool Write');
  assert(events[0].summary.indexOf('index.ts') !== -1, 'Expected file name in summary');
});

test('ignores Read tool', function () {
  var eventsPath = path.join(claudeDir, '.tool-events.json');
  // Write initial events
  fs.writeFileSync(eventsPath, JSON.stringify([{ tool: 'Write', summary: 'test' }]));

  var r = runHook('post-tool-use.js', {
    cwd: tmpDir,
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/test.txt' },
    tool_response: 'file contents',
    tool_use_id: 'tu_456'
  });
  assert(r.exitCode === 0, 'Expected exit 0');
  var events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  assert(events.length === 1, 'Expected still 1 event (Read ignored), got ' + events.length);
});

test('captures Bash test failures', function () {
  var eventsPath = path.join(claudeDir, '.tool-events.json');
  fs.writeFileSync(eventsPath, '[]');

  var r = runHook('post-tool-use.js', {
    cwd: tmpDir,
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: 'FAIL: 3 tests failed\nError: assertion failed',
    tool_use_id: 'tu_789'
  });
  assert(r.exitCode === 0, 'Expected exit 0');
  var events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  assert(events.length === 1, 'Expected 1 event, got ' + events.length);
  assert(events[0].summary.indexOf('FAILED') !== -1 || events[0].summary.indexOf('test') !== -1,
    'Expected failure or test keyword in summary');
});

test('caps events at 100', function () {
  var eventsPath = path.join(claudeDir, '.tool-events.json');
  // Write 100 existing events
  var existingEvents = [];
  for (var ei = 0; ei < 100; ei++) {
    existingEvents.push({ timestamp: new Date().toISOString(), tool: 'Write', id: 'old_' + ei, summary: 'old event ' + ei });
  }
  fs.writeFileSync(eventsPath, JSON.stringify(existingEvents));

  // Add one more
  var r = runHook('post-tool-use.js', {
    cwd: tmpDir,
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/test/new.js' },
    tool_response: 'edited',
    tool_use_id: 'tu_new'
  });
  assert(r.exitCode === 0, 'Expected exit 0');
  var events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  assert(events.length === 100, 'Expected capped at 100, got ' + events.length);
  assert(events[events.length - 1].tool === 'Edit', 'Last event should be the new Edit event');
  assert(events[0].id === 'old_1', 'First event should be old_1 (old_0 dropped)');
});

// ==========================================
console.log('\n=== TEST 15: Cross-project search config ===');
// ==========================================

test('config tracks project dirs via addProjectDir', function () {
  // Load the config module directly
  var configMod = require(path.join(SCRIPT_DIR, 'config.js'));
  var configPath = configMod.CONFIG_PATH;

  // Read current config to restore later
  var originalConfig;
  try { originalConfig = fs.readFileSync(configPath, 'utf8'); } catch (e) { originalConfig = null; }

  // Add a test project dir
  configMod.addProjectDir('/tmp/test-project-a');
  configMod.addProjectDir('/tmp/test-project-b');
  configMod.addProjectDir('/tmp/test-project-a'); // duplicate, should not be added

  var cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(Array.isArray(cfg.projectDirs), 'Expected projectDirs array');
  // Count entries that include test-project
  var testDirs = cfg.projectDirs.filter(function (d) { return d.indexOf('test-project') !== -1; });
  assert(testDirs.length === 2, 'Expected 2 unique test project dirs, got ' + testDirs.length);

  // Restore
  if (originalConfig !== null) {
    fs.writeFileSync(configPath, originalConfig);
  }
});

test('observe-search finds observations across mock projects', function () {
  // Create two mock project dirs with observations
  var projA = path.join(os.tmpdir(), 'obs-search-a-' + Date.now());
  var projB = path.join(os.tmpdir(), 'obs-search-b-' + Date.now());
  fs.mkdirSync(path.join(projA, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(projB, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(projA, '.claude', 'observations.md'),
    'Date: 2026-02-10\n- [P1] (10:00) Authentication uses JWT tokens\n');
  fs.writeFileSync(path.join(projB, '.claude', 'observations.md'),
    'Date: 2026-02-11\n- [P1] (14:00) Database uses PostgreSQL\n');

  // Read both and verify they contain expected content
  var obsA = fs.readFileSync(path.join(projA, '.claude', 'observations.md'), 'utf8');
  var obsB = fs.readFileSync(path.join(projB, '.claude', 'observations.md'), 'utf8');
  assert(obsA.indexOf('JWT') !== -1, 'Project A should contain JWT');
  assert(obsB.indexOf('PostgreSQL') !== -1, 'Project B should contain PostgreSQL');

  // Cleanup
  fs.rmSync(projA, { recursive: true });
  fs.rmSync(projB, { recursive: true });
});

// ==========================================
console.log('\n=== TEST 16: SessionStart — committed/local split ===');
// ==========================================

test('SessionStart injects both committed and local observations', function () {
  fs.writeFileSync(path.join(claudeDir, 'observations.md'),
    'Date: 2026-02-12\n- [P1] (10:00) Architecture uses microservices\n');
  fs.writeFileSync(path.join(claudeDir, 'observations.local.md'),
    'Current Task: Working on auth\nSuggested Next: Continue JWT middleware\n');

  var r = runHook('session-start.js', { cwd: tmpDir, source: 'startup' });
  assert(r.exitCode === 0, 'Expected exit 0');
  var output = JSON.parse(r.stdout);
  var ctx = output.hookSpecificOutput.additionalContext;
  assert(ctx.indexOf('<committed-observations>') !== -1, 'Expected committed-observations tag');
  assert(ctx.indexOf('<local-observations>') !== -1, 'Expected local-observations tag');
  assert(ctx.indexOf('microservices') !== -1, 'Expected committed content');
  assert(ctx.indexOf('auth') !== -1, 'Expected local content');
});

test('Observer prompt mentions committed vs local split', function () {
  var promptsContent = fs.readFileSync(path.join(SCRIPT_DIR, 'prompts.js'), 'utf8');
  assert(promptsContent.indexOf('COMMITTED VS LOCAL') !== -1, 'Expected committed/local split in Observer prompt');
  assert(promptsContent.indexOf('observations.local.md') !== -1, 'Expected local file path in prompt');
});

test('Reflector triggers on either committed or local file exceeding threshold', function () {
  // Test with large LOCAL observations file (committed is small)
  fs.writeFileSync(path.join(claudeDir, 'observations.md'), 'Small committed file\n');
  var bigLocal = '';
  for (var li = 0; li < 3000; li++) {
    bigLocal += '- [P2] (10:' + (li % 60).toString().padStart(2, '0') + ') Local observation entry number ' + li + ' with some additional context padding\n';
  }
  fs.writeFileSync(path.join(claudeDir, 'observations.local.md'), bigLocal);

  // Reset state (no force, high token count to avoid Observer trigger)
  fs.writeFileSync(transcriptPath, generateTranscript(5000));
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 999, lastTokenCount: 99999, forceObservation: false }));

  var r = runHook('stop-check.js', { cwd: tmpDir, transcript_path: transcriptPath });
  assert(r.exitCode === 2, 'Expected exit 2 (Reflector from local), got ' + r.exitCode);
  assert(r.stderr.indexOf('<reflection-request>') !== -1, 'Expected Reflector prompt');
});

test('Reflector prompt mentions both files', function () {
  var promptsContent = fs.readFileSync(path.join(SCRIPT_DIR, 'prompts.js'), 'utf8');
  assert(promptsContent.indexOf('observations.md') !== -1, 'Expected committed file in Reflector');
  assert(promptsContent.indexOf('observations.local.md') !== -1, 'Expected local file in Reflector');
});

test('observe-migrate classifies correctly (Current Task always local)', function () {
  // Read the observe-migrate command to verify it exists and has correct rules
  var migratePath = path.join(os.homedir(), '.claude', 'commands', 'observe-migrate.md');
  // Fallback to source if not installed
  var migrateSourcePath = path.join(__dirname, '..', 'commands', 'observe-migrate.md');
  var migrateMd;
  try {
    migrateMd = fs.readFileSync(migratePath, 'utf8');
  } catch (e) {
    migrateMd = fs.readFileSync(migrateSourcePath, 'utf8');
  }
  assert(migrateMd.indexOf('Current Task') !== -1, 'Migration should mention Current Task classification');
  assert(migrateMd.indexOf('ALWAYS local') !== -1, 'Migration should enforce Current Task as always local');
  assert(migrateMd.indexOf('backup') !== -1, 'Migration should create backup');
});

// ==========================================
console.log('\n=== TEST 17: observe-status readable ===');
// ==========================================

test('observe-status state and observations files are readable and token counts computable', function () {
  // Verify the files that /observe-status would read exist and are parseable
  fs.writeFileSync(path.join(claudeDir, 'observations.md'),
    'Date: 2026-02-13\n- [P1] (10:00) Test observation\n');
  fs.writeFileSync(path.join(claudeDir, '.observer-state.json'),
    JSON.stringify({ lastLine: 10, lastTokenCount: 5000, forceObservation: false }));

  var obsContent = fs.readFileSync(path.join(claudeDir, 'observations.md'), 'utf8');
  var stateContent = JSON.parse(fs.readFileSync(path.join(claudeDir, '.observer-state.json'), 'utf8'));
  var tokens = Math.ceil(obsContent.length / 4);

  assert(tokens > 0, 'Token count should be > 0');
  assert(stateContent.lastTokenCount === 5000, 'State should have correct lastTokenCount');
});

// ==========================================
console.log('\n=== TEST 18: observe-diff git readable ===');
// ==========================================

test('git diff output is readable in a temp repo', function () {
  // Init a git repo, make a commit, then verify diff works
  var diffDir = path.join(os.tmpdir(), 'obs-diff-test-' + Date.now());
  fs.mkdirSync(diffDir, { recursive: true });
  childProcess.execSync('git init', { cwd: diffDir, stdio: 'pipe' });
  childProcess.execSync('git config user.email "test@test.com"', { cwd: diffDir, stdio: 'pipe' });
  childProcess.execSync('git config user.name "Test"', { cwd: diffDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(diffDir, 'test.txt'), 'initial content');
  childProcess.execSync('git add . && git commit -m "init"', { cwd: diffDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(diffDir, 'test.txt'), 'modified content');

  var diff = childProcess.execSync('git diff HEAD', { cwd: diffDir, encoding: 'utf8' });
  assert(diff.indexOf('modified content') !== -1, 'Diff should show changes');

  fs.rmSync(diffDir, { recursive: true });
});

// ==========================================
console.log('\n=== TEST 19: Plan management ===');
// ==========================================

test('finds plan files and counts steps', function () {
  var plansDir = path.join(claudeDir, 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(path.join(plansDir, 'feature-a.md'),
    '## Plan A\n1. [x] Step 1\n2. [x] Step 2\n3. [ ] Step 3\n');
  fs.writeFileSync(path.join(plansDir, 'feature-b.md'),
    '## Plan B\n1. [x] Step 1\n2. [x] Step 2\n');

  // Read plan files and count steps
  var files = fs.readdirSync(plansDir).filter(function (f) { return f.endsWith('.md'); });
  assert(files.length === 2, 'Expected 2 plan files');

  var planA = fs.readFileSync(path.join(plansDir, 'feature-a.md'), 'utf8');
  var completedA = (planA.match(/\[x\]/gi) || []).length;
  var pendingA = (planA.match(/\[ \]/g) || []).length;
  assert(completedA === 2, 'Plan A: expected 2 completed');
  assert(pendingA === 1, 'Plan A: expected 1 pending');
});

test('identifies completed plans (100% done)', function () {
  var plansDir = path.join(claudeDir, 'plans');
  var planB = fs.readFileSync(path.join(plansDir, 'feature-b.md'), 'utf8');
  var completedB = (planB.match(/\[x\]/gi) || []).length;
  var pendingB = (planB.match(/\[ \]/g) || []).length;
  assert(completedB === 2 && pendingB === 0, 'Plan B should be 100% complete');
});

test('can delete completed plans', function () {
  var plansDir = path.join(claudeDir, 'plans');
  // Delete plan B (it's complete)
  fs.unlinkSync(path.join(plansDir, 'feature-b.md'));
  var remaining = fs.readdirSync(plansDir).filter(function (f) { return f.endsWith('.md'); });
  assert(remaining.length === 1, 'Expected 1 remaining plan');
  assert(remaining[0] === 'feature-a.md', 'Expected feature-a.md to remain');

  // Cleanup
  fs.rmSync(plansDir, { recursive: true });
});

// ==========================================
console.log('\n=== TEST 20: observe-pr readable ===');
// ==========================================

test('observations and plan files readable for PR generation', function () {
  fs.writeFileSync(path.join(claudeDir, 'observations.md'),
    'Date: 2026-02-13\n- [P1] (10:00) Implemented auth system\n- [P2] (10:05) Added JWT middleware\n');

  var plansDir = path.join(claudeDir, 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(path.join(plansDir, 'feature-auth.md'),
    '## Auth Plan\n1. [x] JWT middleware\n2. [x] Login endpoint\n3. [ ] Refresh tokens\n');

  var obs = fs.readFileSync(path.join(claudeDir, 'observations.md'), 'utf8');
  var plan = fs.readFileSync(path.join(plansDir, 'feature-auth.md'), 'utf8');
  assert(obs.indexOf('auth system') !== -1, 'Observations should be readable');
  assert(plan.indexOf('JWT') !== -1, 'Plan should be readable');

  // Cleanup
  fs.rmSync(plansDir, { recursive: true });
});

// ==========================================
// Cleanup
// ==========================================

// Reset observations to something simple for cleanup
fs.writeFileSync(path.join(claudeDir, 'observations.md'), sampleObs);
try { fs.unlinkSync(path.join(claudeDir, 'observations.local.md')); } catch (e) { /* ok */ }
try { fs.unlinkSync(path.join(claudeDir, '.tool-events.json')); } catch (e) { /* ok */ }
try { fs.unlinkSync(path.join(claudeDir, '.pending-observation')); } catch (e) { /* ok */ }

fs.rmSync(tmpDir, { recursive: true });

console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
