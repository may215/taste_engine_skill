#!/usr/bin/env node
/**
 * Cline adapter — PostToolUse hook
 *
 * Called by Cline after Write/Edit tool use.
 * Feeds the file to taste extraction.
 *
 * Usage: hook.js <file-path>
 */

const { spawnSync } = require('child_process');
const path = require('path');

const TASTE_DIR = process.env.HOME + '/.claude/skills/taste';
const CAPTURE = TASTE_DIR + '/adapters/shared/taste-platform-capture.js';

const ext = path.extname(process.argv[2] || '').toLowerCase();
const skipExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.tar', '.gz', '.pdf', '.lock', '.log', '.DS_Store']);
if (skipExts.has(ext)) process.exit(0);

spawnSync('node', [CAPTURE, process.argv[2]], {
  timeout: 5000,
  stdio: 'pipe',
});
