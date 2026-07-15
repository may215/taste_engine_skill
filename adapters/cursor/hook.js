#!/usr/bin/env node
/**
 * Cursor adapter — File watcher hook
 *
 * Runs on file save in Cursor. Called by .cursor/rules/taste.mdc
 * or configured as an on-save trigger in Cursor settings.
 *
 * Usage:
 *   cursor-hook.js <file-path>
 */

const { spawnSync } = require('child_process');
const path = require('path');

const TASTE_DIR = process.env.HOME + '/.claude/skills/taste';
const CAPTURE = TASTE_DIR + '/adapters/shared/taste-platform-capture.js';

const ext = path.extname(process.argv[2] || '').toLowerCase();
const skipExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.tar', '.gz', '.pdf', '.lock', '.log', '.DS_Store']);

if (skipExts.has(ext)) process.exit(0);

const result = spawnSync('node', [CAPTURE, process.argv[2]], {
  timeout: 5000,
  stdio: 'pipe',
});

if (result.stdout) {
  const out = result.stdout.toString().trim();
  if (out && !out.includes('"ok": false')) {
    try {
      const parsed = JSON.parse(out);
      if (parsed.patterns && parsed.patterns.length > 0) {
        for (const p of parsed.patterns) console.log('[taste] ' + p);
      }
    } catch (e) {}
  }
}
