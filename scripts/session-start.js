'use strict';

var config = require('./config');
var childProcess = require('child_process');

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

  var fs = require('fs');
  var path = require('path');
  var observationsPath = path.join(cwd, '.claude', 'observations.md');

  if (!fs.existsSync(observationsPath)) {
    process.exit(0);
  }

  var observations;
  try {
    observations = fs.readFileSync(observationsPath, 'utf8').trim();
  } catch (e) {
    process.exit(0);
  }

  if (!observations) {
    process.exit(0);
  }

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

  var sections = [
    '<prior-observations>',
    preamble,
    '',
    observations,
    '</prior-observations>'
  ];

  // Inject active plan if it exists (keyed by branch name)
  var branch = getCurrentBranch(cwd);
  var plansDir = path.join(cwd, '.claude', 'plans');
  var planPath = branch ? path.join(plansDir, branch + '.md') : '';

  // Fall back to plan.md for non-branch contexts
  if (!planPath || !fs.existsSync(planPath)) {
    planPath = path.join(cwd, '.claude', 'plan.md');
  }

  try {
    var plan = fs.readFileSync(planPath, 'utf8').trim();
    if (plan) {
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

  var context = sections.join('\n');

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
