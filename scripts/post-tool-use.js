'use strict';

var fs = require('fs');
var path = require('path');
var config = require('./config');

// Tools that produce significant events worth tracking
var SIGNIFICANT_TOOLS = ['Write', 'Edit', 'TaskCreate', 'TaskUpdate'];

// Bash commands that indicate significant operations
var SIGNIFICANT_BASH_KEYWORDS = [
  'test', 'build', 'deploy', 'push', 'install', 'publish', 'migrate', 'npm run', 'npx'
];

// Response keywords that indicate failures
var FAILURE_KEYWORDS = ['error', 'failed', 'FAIL', 'ERR!', 'exception', 'rejected'];

var MAX_EVENTS = 100;
var EVENTS_FILENAME = '.tool-events.json';

function isBashSignificant(toolInput, toolResponse) {
  var command = (toolInput && toolInput.command) || '';
  var response = toolResponse || '';

  // Check if the command matches significant keywords
  for (var i = 0; i < SIGNIFICANT_BASH_KEYWORDS.length; i++) {
    if (command.indexOf(SIGNIFICANT_BASH_KEYWORDS[i]) !== -1) {
      return true;
    }
  }

  // Check if the response indicates a failure
  for (var j = 0; j < FAILURE_KEYWORDS.length; j++) {
    if (response.indexOf(FAILURE_KEYWORDS[j]) !== -1) {
      return true;
    }
  }

  return false;
}

function summarize(toolName, toolInput, toolResponse) {
  if (toolName === 'Write') {
    var filePath = (toolInput && toolInput.file_path) || 'unknown';
    return 'Wrote file: ' + filePath.split(/[/\\]/).pop();
  }
  if (toolName === 'Edit') {
    var editPath = (toolInput && toolInput.file_path) || 'unknown';
    return 'Edited file: ' + editPath.split(/[/\\]/).pop();
  }
  if (toolName === 'Bash') {
    var cmd = (toolInput && toolInput.command) || '';
    var truncated = cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd;
    var hasFail = false;
    var resp = toolResponse || '';
    for (var i = 0; i < FAILURE_KEYWORDS.length; i++) {
      if (resp.indexOf(FAILURE_KEYWORDS[i]) !== -1) {
        hasFail = true;
        break;
      }
    }
    return (hasFail ? '[FAILED] ' : '') + 'Ran: ' + truncated;
  }
  if (toolName === 'TaskCreate' || toolName === 'TaskUpdate') {
    var subject = (toolInput && toolInput.subject) || (toolInput && toolInput.taskId) || '';
    return toolName + ': ' + subject;
  }
  return toolName;
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

  var toolName = input.tool_name || '';

  // Filter: only capture significant tools
  var isSignificant = false;
  if (SIGNIFICANT_TOOLS.indexOf(toolName) !== -1) {
    isSignificant = true;
  } else if (toolName === 'Bash') {
    isSignificant = isBashSignificant(input.tool_input, input.tool_response);
  }

  if (!isSignificant) {
    process.exit(0);
  }

  // Build event entry
  var event = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    id: input.tool_use_id || '',
    summary: summarize(toolName, input.tool_input, input.tool_response)
  };

  // Read existing events
  var claudeDir = path.join(cwd, '.claude');
  var eventsPath = path.join(claudeDir, EVENTS_FILENAME);
  var events = [];

  try {
    events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    if (!Array.isArray(events)) events = [];
  } catch (e) {
    events = [];
  }

  // Append and cap at MAX_EVENTS
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }

  // Write back
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));

  process.exit(0);
}

main().catch(function () { process.exit(0); });
