'use strict';

var fs = require('fs');
var path = require('path');
var config = require('./config');
var transcript = require('./transcript');
var prompts = require('./prompts');

async function main() {
  var input = await config.readStdin();
  if (!input) {
    process.exit(0);
  }

  // Prevent infinite loop: if we're already in a stop-hook-triggered continuation, exit cleanly
  if (input.stop_hook_active) {
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

  // --- Phase 1: Check if OBSERVATION is needed (new transcript content) ---
  var measured = transcript.measureTranscript(transcriptPath);
  var newTokens = measured.contentTokens - (state.lastTokenCount || 0);
  var needsObservation = state.forceObservation || newTokens >= cfg.observationThreshold;

  if (needsObservation) {
    // Update state: record current position, reset force flag
    config.writeState(cwd, {
      lastLine: measured.totalLines,
      lastTokenCount: measured.contentTokens,
      forceObservation: false
    });

    // Exit 2 with Observer prompt — Claude extracts observations from its context
    process.stderr.write(prompts.OBSERVER_PROMPT);
    process.exit(2);
  }

  // --- Phase 2: Check if REFLECTION is needed (observations file too large) ---
  var observationsPath = path.join(cwd, '.claude', 'observations.md');
  var needsReflection = false;

  try {
    var obsContent = fs.readFileSync(observationsPath, 'utf8');
    var obsTokens = transcript.estimateTokens(obsContent);
    if (obsTokens >= (cfg.reflectionThreshold || 40000)) {
      needsReflection = true;
    }
  } catch (e) {
    // File doesn't exist or can't be read — no reflection needed
  }

  if (needsReflection) {
    // Update state position (no force flag change needed)
    config.writeState(cwd, {
      lastLine: measured.totalLines,
      lastTokenCount: measured.contentTokens,
      forceObservation: false
    });

    // Exit 2 with Reflector prompt — Claude consolidates the observations file
    process.stderr.write(prompts.REFLECTOR_PROMPT);
    process.exit(2);
  }

  // --- Neither needed: update state and exit cleanly ---
  config.writeState(cwd, {
    lastLine: measured.totalLines,
    lastTokenCount: measured.contentTokens,
    forceObservation: false
  });
  process.exit(0);
}

main().catch(function () { process.exit(0); });
