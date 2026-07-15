#!/usr/bin/env node
/**
 * taste-watch.js — File watcher for taste engine.
 *
 * Watches source directories for file saves (manual edits made outside
 * Claude Code) and feeds them to the taste extractor.
 *
 * Usage:
 *   taste-watch.js <dir>
 *   taste-watch.js --project
 *   taste-watch.js --background
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const TASTE_DIR = process.env.HOME + '/.claude/skills/taste';
const EXTRACTOR = TASTE_DIR + '/scripts/taste-extract.js';
const PID_FILE = TASTE_DIR + '/cache/watch.pid';

// ── Debounce ─────────────────────────────────────────────────────────────────

const queue = {};
let flushTimer = null;

function enqueue(filePath) {
  const stat = fs.statSync(filePath);
  queue[filePath] = { filePath, mtime: stat.mtimeMs };

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushAll, 2000);
}

function flushAll() {
  flushTimer = null;
  for (const [key, entry] of Object.entries(queue)) {
    try {
      const result = spawnSync('node', [EXTRACTOR, entry.filePath, '--accept'], {
        timeout: 3000,
        stdio: 'pipe',
      });
      if (result.stdout) {
        const out = result.stdout.toString().trim();
        if (out) console.log('[taste] ' + out);
      }
    } catch (e) { /* silent */ }
  }
  for (const key of Object.keys(queue)) delete queue[key];
}

// ── Skip noise ───────────────────────────────────────────────────────────────

function shouldSkip(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const skipExts = new Set([
    '.log', '.lock', '.gitignore', '.gitkeep', '.ds_store',
    '.map', '.min.js', '.min.css', '.ico', '.png', '.jpg',
    '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot',
    '.mp4', '.mp3', '.webm', '.webp', '.zip', '.tar', '.gz',
  ]);
  if (skipExts.has(ext)) return true;

  const skipDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.turbo',
    'coverage', '.cache', '__pycache__', '.venv', 'venv',
  ]);
  for (const dir of filePath.split('/')) {
    if (skipDirs.has(dir)) return true;
  }

  return false;
}

// ── Detect project root ──────────────────────────────────────────────────────

function detectProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

// ── Watcher ──────────────────────────────────────────────────────────────────

function startWatcher(watchDir) {
  if (!fs.existsSync(watchDir)) {
    console.error('[taste] Directory not found: ' + watchDir);
    process.exit(1);
  }

  console.log('[taste] Watching: ' + watchDir);
  console.log('[taste] PID: ' + process.pid);
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch (e) {}

  // Try fswatch first
  const fswatchCheck = spawnSync('which', ['fswatch'], { stdio: 'pipe' });
  if (fswatchCheck.status === 0) {
    const watcher = spawn('fswatch', [
      '--event', 'Updated',
      '--latency', '0.5',
      '--recursive',
      watchDir,
    ]);

    watcher.stdout.on('data', (data) => {
      const files = data.toString().trim().split('\n').filter(Boolean);
      for (const f of files) {
        if (fs.existsSync(f) && !shouldSkip(f)) enqueue(f);
      }
    });

    watcher.on('exit', (code) => {
      console.log('[taste] Watcher exited (code ' + code + ')');
      cleanup();
    });

    process.on('SIGINT', () => { watcher.kill(); cleanup(); });
    process.on('SIGTERM', () => { watcher.kill(); cleanup(); });
    return;
  }

  // Fallback to fs.watch
  console.log('[taste] fswatch not found, using fs.watch fallback');
  const watchedDirs = new Map();
  let isScanning = false;

  function walkDir(dir) {
    if (isScanning) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (shouldSkip(fullPath)) continue;
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          walkDir(fullPath);
        }
      }
      if (!watchedDirs.has(dir)) {
        try {
          fs.watch(dir, (eventType, filename) => {
            if (filename && eventType === 'change') {
              const fullPath = path.join(dir, filename);
              if (fs.existsSync(fullPath) && !shouldSkip(fullPath)) enqueue(fullPath);
            }
          });
          watchedDirs.set(dir, true);
        } catch (e) {}
      }
    } catch (e) {}
  }

  walkDir(watchDir);
  console.log('[taste] Watching ' + watchedDirs.size + ' directories');

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function cleanup() {
  console.log('\n[taste] Stopped');
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {}
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--background')) {
    const daemonArgs = args.filter(a => a !== '--background');
    const child = spawn(process.argv[1], daemonArgs.length ? daemonArgs : ['--project'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('[taste] Daemon started (PID ' + child.pid + ')');
    process.exit(0);
  }

  if (args.includes('--project')) {
    startWatcher(detectProjectRoot(process.cwd()));
    return;
  }

  const dir = args.length > 0 && !args[0].startsWith('--')
    ? path.resolve(args[0])
    : process.cwd();
  startWatcher(dir);
}

main();