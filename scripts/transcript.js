'use strict';

var fs = require('fs');

/**
 * Rough token estimate from text length (~4 chars per token).
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Extract text content from a single transcript entry.
 * Returns { role, text, timestamp } or null if not a content entry.
 */
function extractContent(entry) {
  var type = entry.type;

  if (type !== 'user' && type !== 'assistant') {
    return null;
  }

  var message = entry.message;
  if (!message || !message.content) return null;

  var texts = [];
  var contentBlocks = Array.isArray(message.content)
    ? message.content
    : [{ type: 'text', text: String(message.content) }];

  for (var i = 0; i < contentBlocks.length; i++) {
    var block = contentBlocks[i];
    if (block.type === 'text' && block.text) {
      texts.push(block.text);
    }
    // Skip tool_use, tool_result, thinking blocks
  }

  if (texts.length === 0) return null;

  return {
    role: message.role || type,
    text: texts.join('\n'),
    timestamp: entry.timestamp
  };
}

/**
 * Measure transcript content from a JSONL file.
 * Returns { totalLines, contentTokens } where:
 *   totalLines   = count of all non-empty JSONL lines (for position tracking)
 *   contentTokens = estimated token count of user/assistant text content
 */
function measureTranscript(transcriptPath) {
  var content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch (e) {
    return { totalLines: 0, contentTokens: 0 };
  }

  var lines = content.split('\n');
  var totalLines = 0;
  var contentTokens = 0;

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (!trimmed) continue;
    totalLines++;

    try {
      var entry = JSON.parse(trimmed);
      var extracted = extractContent(entry);
      if (extracted) {
        contentTokens += estimateTokens(extracted.text);
      }
    } catch (e) {
      // Skip malformed lines
    }
  }

  return { totalLines: totalLines, contentTokens: contentTokens };
}

/**
 * Parse transcript JSONL and return extracted content entries from startLine onward.
 */
function parseTranscript(transcriptPath, startLine) {
  if (startLine === undefined) startLine = 0;
  var entries = [];
  var content;

  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch (e) {
    return { entries: entries, totalLines: 0 };
  }

  var lines = content.split('\n');
  var lineIndex = 0;

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (!trimmed) continue;
    lineIndex++;

    if (lineIndex <= startLine) continue;

    try {
      var entry = JSON.parse(trimmed);
      var extracted = extractContent(entry);
      if (extracted) {
        entries.push(extracted);
      }
    } catch (e) {
      // Skip malformed lines
    }
  }

  return { entries: entries, totalLines: lineIndex };
}

module.exports = { measureTranscript: measureTranscript, extractContent: extractContent, parseTranscript: parseTranscript, estimateTokens: estimateTokens };
