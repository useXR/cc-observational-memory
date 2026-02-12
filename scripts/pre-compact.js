'use strict';

var config = require('./config');

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

  // Set force-observation flag so the next Stop hook triggers observation
  var state = config.readState(cwd);
  state.forceObservation = true;
  config.writeState(cwd, state);

  process.exit(0);
}

main().catch(function () { process.exit(0); });
