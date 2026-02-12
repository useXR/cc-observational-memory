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
// Cleanup
// ==========================================

fs.rmSync(tmpDir, { recursive: true });

console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
