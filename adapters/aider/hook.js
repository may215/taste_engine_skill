#!/usr/bin/env node
/**
 * Aider adapter — On-file-change hook
 *
 * Called by git post-commit or aider's automation to capture patterns
 * from committed diffs.
 *
 * Usage: hook.js [--last-commit | <file-path>]
 */

const fs = require('fs');
const { spawnSync } = require('child_process');

const TASTE_DIR = process.env.HOME + '/.claude/skills/taste';
const CAPTURE = TASTE_DIR + '/adapters/shared/taste-platform-capture.js';

function captureFromLastCommit() {
  try {
    const result = spawnSync('git', ['diff', 'HEAD~1', '--name-only'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const files = result.stdout.trim().split('\n').filter(Boolean);
    for (const file of files) {
      if (file && fs.existsSync(file)) {
        spawnSync('node', [CAPTURE, file], { timeout: 5000, stdio: 'pipe' });
      }
    }
    console.log('[taste] Captured ' + files.length + ' files from last commit');
  } catch (e) {
    console.error('[taste] Error: ' + e.message);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--last-commit')) {
    captureFromLastCommit();
    return;
  }
  if (args[0]) {
    spawnSync('node', [CAPTURE, args[0]], { timeout: 5000, stdio: 'pipe' });
  }
}

main();
