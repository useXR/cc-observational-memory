'use strict';

var fs = require('fs');
var path = require('path');
var config = require('./config');
var transcript = require('./transcript');

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

  var transcriptPath = input.transcript_path;
  if (!transcriptPath) {
    process.exit(0);
  }

  var state = config.readState(cwd);

  // Measure transcript to calculate new tokens since last observation
  var measured = transcript.measureTranscript(transcriptPath);
  var newTokens = measured.contentTokens - (state.lastTokenCount || 0);

  // If significant uncaptured activity, write pending-observation marker
  if (newTokens >= 5000 || state.forceObservation) {
    var claudeDir = path.join(cwd, '.claude');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    var marker = {
      reason: input.reason || 'session_end',
      timestamp: new Date().toISOString(),
      newTokens: newTokens
    };

    fs.writeFileSync(
      path.join(claudeDir, '.pending-observation'),
      JSON.stringify(marker, null, 2)
    );

    // Set force flag so next session's Stop hook triggers observation
    config.writeState(cwd, {
      lastLine: state.lastLine,
      lastTokenCount: state.lastTokenCount,
      forceObservation: true
    });
  }

  // Always exit 0 — SessionEnd must not block
  process.exit(0);
}

main().catch(function () { process.exit(0); });
