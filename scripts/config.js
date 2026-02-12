'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var CONFIG_DIR = path.join(os.homedir(), '.claude', 'observational-memory');
var CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

var DEFAULTS = {
  observationThreshold: 30000,
  reflectionThreshold: 40000,
  enabled: true
};

/**
 * Load global configuration, merging with defaults.
 */
function loadConfig() {
  try {
    var raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    var cfg = JSON.parse(raw);
    return Object.assign({}, DEFAULTS, cfg);
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
}

/**
 * Check if a project has opted out of observations.
 */
function isProjectOptedOut(cwd) {
  var optOutFile = path.join(cwd, '.claude', '.no-observations');
  return fs.existsSync(optOutFile);
}

var STATE_FILENAME = '.observer-state.json';

var DEFAULT_STATE = { lastLine: 0, lastTokenCount: 0, forceObservation: false };

/**
 * Read observer state from a project's .claude directory.
 */
function readState(cwd) {
  var statePath = path.join(cwd, '.claude', STATE_FILENAME);
  try {
    var raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return Object.assign({}, DEFAULT_STATE, raw);
  } catch (e) {
    return Object.assign({}, DEFAULT_STATE);
  }
}

/**
 * Write observer state to a project's .claude directory.
 */
function writeState(cwd, state) {
  var dir = path.join(cwd, '.claude');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, STATE_FILENAME), JSON.stringify(state, null, 2));
}

/**
 * Read and parse JSON from stdin. Returns parsed object or null on failure.
 */
function readStdin() {
  return new Promise(function (resolve) {
    var data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) { data += chunk; });
    process.stdin.on('end', function () {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve(null);
      }
    });
    process.stdin.on('error', function () { resolve(null); });
  });
}

module.exports = {
  loadConfig: loadConfig,
  isProjectOptedOut: isProjectOptedOut,
  readState: readState,
  writeState: writeState,
  readStdin: readStdin,
  CONFIG_DIR: CONFIG_DIR,
  CONFIG_PATH: CONFIG_PATH,
  DEFAULTS: DEFAULTS
};
