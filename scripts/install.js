'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var HOME = os.homedir();
var TARGET_DIR = path.join(HOME, '.claude', 'observational-memory');
var COMMANDS_DIR = path.join(HOME, '.claude', 'commands');
var SETTINGS_PATH = path.join(HOME, '.claude', 'settings.json');
var CONFIG_PATH = path.join(TARGET_DIR, 'config.json');

var SCRIPTS = [
  'session-start.js',
  'stop-check.js',
  'pre-compact.js',
  'transcript.js',
  'config.js',
  'prompts.js'
];

function copyScripts() {
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  var srcDir = __dirname;
  for (var i = 0; i < SCRIPTS.length; i++) {
    var script = SCRIPTS[i];
    var src = path.join(srcDir, script);
    var dest = path.join(TARGET_DIR, script);
    fs.copyFileSync(src, dest);
    console.log('  Copied ' + script);
  }
}

function getHookConfig() {
  // Use forward slashes — works cross-platform with node
  var scriptDir = TARGET_DIR.replace(/\\/g, '/');

  return {
    SessionStart: [{
      matcher: 'startup|resume|compact|clear',
      hooks: [{
        type: 'command',
        command: 'node "' + scriptDir + '/session-start.js"',
        timeout: 5
      }]
    }],
    Stop: [{
      hooks: [{
        type: 'command',
        command: 'node "' + scriptDir + '/stop-check.js"',
        timeout: 10
      }]
    }],
    PreCompact: [{
      hooks: [{
        type: 'command',
        command: 'node "' + scriptDir + '/pre-compact.js"',
        timeout: 5
      }]
    }]
  };
}

function mergeHooks(existingSettings) {
  var settings = Object.assign({}, existingSettings);
  var newHooks = getHookConfig();

  if (!settings.hooks) {
    settings.hooks = {};
  }

  var events = Object.keys(newHooks);
  for (var i = 0; i < events.length; i++) {
    var event = events[i];

    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Remove any existing observational-memory hooks to avoid duplicates
    settings.hooks[event] = settings.hooks[event].filter(function (h) {
      var cmds = (h.hooks || []).map(function (hh) { return hh.command || ''; });
      return !cmds.some(function (c) { return c.indexOf('observational-memory') !== -1; });
    });

    // Add new hooks
    var hookConfigs = newHooks[event];
    for (var j = 0; j < hookConfigs.length; j++) {
      settings.hooks[event].push(hookConfigs[j]);
    }
  }

  return settings;
}

function installCommand() {
  if (!fs.existsSync(COMMANDS_DIR)) {
    fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  }

  var src = path.join(__dirname, '..', 'commands', 'observe.md');
  var dest = path.join(COMMANDS_DIR, 'observe.md');
  fs.copyFileSync(src, dest);
  console.log('  Installed /observe command');
}

function createDefaultConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    console.log('  Config already exists, keeping existing');
    return;
  }

  var defaultConfig = {
    observationThreshold: 30000,
    reflectionThreshold: 40000,
    enabled: true
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
  console.log('  Created default config');
}

function main() {
  console.log('Installing Observational Memory for Claude Code...\n');

  // 1. Copy scripts
  console.log('Copying scripts to ' + TARGET_DIR);
  copyScripts();

  // 2. Read existing settings
  var settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      console.log('\nRead existing settings.json');
    } catch (e) {
      console.log('\nWarning: Could not parse existing settings.json, creating new');
    }
  } else {
    console.log('\nNo existing settings.json found, creating new');
    var claudeDir = path.join(HOME, '.claude');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
  }

  // 3. Merge hooks
  console.log('Merging hook configuration...');
  settings = mergeHooks(settings);

  // 4. Write settings
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log('Updated ' + SETTINGS_PATH);

  // 5. Install slash command
  console.log('\nInstalling slash command...');
  installCommand();

  // 6. Create default config
  console.log('\nCreating configuration...');
  createDefaultConfig();

  console.log('\nInstallation complete!\n');
  console.log('Hooks installed:');
  console.log('  - SessionStart: Injects prior observations on startup/resume/compact/clear');
  console.log('  - Stop: Triggers observation extraction when threshold reached');
  console.log('  - PreCompact: Ensures observations before context compaction');
  console.log('\nSlash command: /observe — manually trigger observation before compact/clear');
  console.log('\nPer-project opt-out: create .claude/.no-observations in any project');
  console.log('Global config: ' + CONFIG_PATH);
}

main();
