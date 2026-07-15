#!/usr/bin/env node
/**
 * taste-platform-capture.js — Shared capture adapter for any platform.
 *
 * Called by platform-specific hooks (Cursor, Copilot, Windsurf, etc.)
 * Takes a file path, runs extraction, returns structured result.
 *
 * Usage:
 *   taste-platform-capture.js <file-path> [--diff "<text>"]
 *   taste-platform-capture.js --stdin          # read file path from stdin
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = process.env.HOME;
const TASTE_DIR = HOME + '/.claude/skills/taste';
// Support both repo layout (src/) and deployed layout (scripts/)
const EXTRACTOR = (fs.existsSync(TASTE_DIR + '/src/taste-extract.js'))
  ? TASTE_DIR + '/src/taste-extract.js'
  : TASTE_DIR + '/scripts/taste-extract.js';

function capture(filePath, diff) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: 'File not found: ' + filePath };
  }

  // Skip binary/large files
  const stat = fs.statSync(filePath);
  if (stat.size > 100000) return { ok: false, error: 'File too large (>100KB)' };

  const ext = path.extname(filePath).toLowerCase();
  const skipExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
    '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.webm',
    '.zip', '.tar', '.gz', '.pdf', '.lock', '.log',
  ]);
  if (skipExts.has(ext)) return { ok: false, error: 'Binary/asset file skipped' };

  // Run the extractor
  const args = [EXTRACTOR, filePath, '--accept'];
  if (diff) args.push('--diff', diff);

  const result = spawnSync('node', args, {
    timeout: 5000,
    stdio: 'pipe',
  });

  const stdout = result.stdout ? result.stdout.toString().trim() : '';
  const stderr = result.stderr ? result.stderr.toString().trim() : '';
  const patterns = stdout ? stdout.split('\n').filter(l => l.startsWith('✓') || l.startsWith('No ') || l.startsWith('No changes')) : [];

  return {
    ok: result.status === 0 || result.status === null,
    patterns,
    stdout,
    stderr,
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--stdin')) {
    // Read file paths from stdin (one per line, for piped input)
    const input = fs.readFileSync('/dev/stdin', 'utf8').trim();
    const files = input.split('\n').filter(Boolean);
    const results = files.map(f => ({ file: f, ...capture(f) }));
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const filePath = args[0];
  let diff = '';
  const diffIdx = args.indexOf('--diff');
  if (diffIdx >= 0) diff = args.slice(diffIdx + 1).join(' ');

  if (!filePath) {
    console.error('Usage: taste-platform-capture.js <file-path> [--diff "<text>"]');
    process.exit(1);
  }

  const result = capture(filePath, diff);
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();
module.exports = { capture };
