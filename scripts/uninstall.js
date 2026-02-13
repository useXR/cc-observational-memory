'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var HOME = os.homedir();
var TARGET_DIR = path.join(HOME, '.claude', 'observational-memory');
var COMMANDS_DIR = path.join(HOME, '.claude', 'commands');
var SETTINGS_PATH = path.join(HOME, '.claude', 'settings.json');

function removeHooks() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    console.log('No settings.json found, nothing to remove');
    return;
  }

  var settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (e) {
    console.log('Could not parse settings.json');
    return;
  }

  if (!settings.hooks) {
    console.log('No hooks in settings.json');
    return;
  }

  var removed = 0;
  var events = Object.keys(settings.hooks);

  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var before = settings.hooks[event].length;

    settings.hooks[event] = settings.hooks[event].filter(function (h) {
      var cmds = (h.hooks || []).map(function (hh) { return hh.command || ''; });
      return !cmds.some(function (c) { return c.indexOf('observational-memory') !== -1; });
    });

    removed += before - settings.hooks[event].length;

    // Clean up empty arrays
    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log('Removed ' + removed + ' hook(s) from settings.json');
}

function removeScripts() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.log('Scripts directory not found');
    return;
  }

  fs.rmSync(TARGET_DIR, { recursive: true });
  console.log('Removed scripts directory: ' + TARGET_DIR);
}

function removeCommands() {
  var commands = ['observe.md', 'observe-init.md', 'worktree-init.md', 'worktree-merge.md'];
  for (var i = 0; i < commands.length; i++) {
    var commandPath = path.join(COMMANDS_DIR, commands[i]);
    if (fs.existsSync(commandPath)) {
      fs.unlinkSync(commandPath);
      console.log('Removed /' + commands[i].replace('.md', '') + ' command');
    }
  }
}

function main() {
  var removeFiles = process.argv.indexOf('--remove-scripts') !== -1;

  console.log('Uninstalling Observational Memory...\n');

  removeHooks();
  removeCommands();

  if (removeFiles) {
    console.log('');
    removeScripts();
  } else {
    console.log('\nScripts left in place at: ' + TARGET_DIR);
    console.log('Use --remove-scripts to also remove the scripts directory');
  }

  console.log('\nUninstallation complete!');
  console.log('Note: Per-project .claude/observations.md files are preserved.');
}

main();
