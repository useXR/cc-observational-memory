'use strict';

var config = require('./config');
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

function getCurrentBranch(cwd) {
  try {
    return childProcess.execSync('git branch --show-current', {
      cwd: cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    return '';
  }
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (e) {
    return '';
  }
}

async function main() {
  var input = await config.readStdin();
  if (!input) {
    process.exit(0);
  }

  var cwd = input.cwd || process.cwd();
  var cfg = config.loadConfig();

  if (!cfg.enabled || config.isProjectOptedOut(cwd)) {
    process.exit(0);
  }

  // Auto-register project for cross-project search
  try { config.addProjectDir(cwd); } catch (e) { /* best-effort */ }

  // Read all observation sources
  var committedObs = readFileSafe(path.join(cwd, '.claude', 'observations.md'));
  var localObs = readFileSafe(path.join(cwd, '.claude', 'observations.local.md'));
  var globalObs = readFileSafe(path.join(config.CONFIG_DIR, 'observations-global.md'));

  // Exit if all observation sources are empty (plan check happens below)
  var hasAnyObs = committedObs || localObs || globalObs;

  var source = input.source || 'startup';
  var isContextReset = (source === 'compact' || source === 'clear');

  var preamble;
  if (isContextReset) {
    preamble = [
      'The context was just ' + (source === 'clear' ? 'cleared' : 'compacted') + '.',
      'The following observations are your ONLY memory of prior work in this project.',
      'Use them to continue seamlessly. Look for "Current Task" and "Suggested Next"',
      'at the end of the observations to pick up where you left off.',
      'Do not mention the context reset or observations unless the user asks.'
    ].join(' ');
  } else {
    preamble = [
      'The following observations were recorded from previous sessions in this project.',
      'Use them to maintain continuity. Do not mention them unless relevant.'
    ].join(' ');
  }

  var sections = [];

  // Global observations
  if (globalObs) {
    sections.push('<global-context>');
    sections.push(globalObs);
    sections.push('</global-context>');
    sections.push('');
  }

  // Project observations (committed + local)
  if (committedObs || localObs) {
    sections.push('<project-context>');
    if (committedObs) {
      sections.push('<committed-observations>');
      sections.push(committedObs);
      sections.push('</committed-observations>');
    }
    if (localObs) {
      if (committedObs) sections.push('');
      sections.push('<local-observations>');
      sections.push(localObs);
      sections.push('</local-observations>');
    }
    sections.push('</project-context>');
  }

  // Inject active plan if it exists (keyed by branch name)
  var branch = getCurrentBranch(cwd);
  var plansDir = path.join(cwd, '.claude', 'plans');
  var planPath = branch ? path.join(plansDir, branch + '.md') : '';

  // Fall back to plan.md for non-branch contexts
  if (!planPath || !fs.existsSync(planPath)) {
    planPath = path.join(cwd, '.claude', 'plan.md');
  }

  var hasPlan = false;
  try {
    var plan = fs.readFileSync(planPath, 'utf8').trim();
    if (plan) {
      hasPlan = true;
      sections.push('');
      sections.push('<active-plan branch="' + (branch || 'unknown') + '">');
      sections.push('The following plan was in progress. Continue from where it left off.');
      sections.push('');
      sections.push(plan);
      sections.push('</active-plan>');
    }
  } catch (e) {
    // No plan file, that's fine
  }

  // Check for pending observation from SessionEnd
  var pendingPath = path.join(cwd, '.claude', '.pending-observation');
  try {
    var pendingRaw = fs.readFileSync(pendingPath, 'utf8');
    var pending = JSON.parse(pendingRaw);
    if (pending && pending.newTokens) {
      sections.push('');
      sections.push('<system-note>');
      sections.push('Previous session ended with ~' + pending.newTokens + ' tokens of uncaptured activity. Consider running /observe.');
      sections.push('</system-note>');
    }
    // Delete the marker
    fs.unlinkSync(pendingPath);
  } catch (e) {
    // No pending observation, that's fine
  }

  // Exit if nothing to inject
  if (!hasAnyObs && !hasPlan) {
    process.exit(0);
  }

  // Wrap everything in prior-observations with preamble
  var context = [
    '<prior-observations>',
    preamble,
    '',
    sections.join('\n'),
    '</prior-observations>'
  ].join('\n');

  var output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context
    }
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch(function () { process.exit(0); });
