#!/usr/bin/env node
/**
 * taste-init.js — One-time setup / health check for Taste Engine.
 *
 * Usage: node taste-init.js [--project <path>]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = process.env.HOME;
const TASTE_DIR = HOME + '/.claude/skills/taste';
// Support both repo layout (src/) and installed layout (scripts/)
const SRC_DIR = fs.existsSync(__dirname) ? __dirname : TASTE_DIR + '/scripts';
const REQUIRED_DIRS = [
  'memory/formatting',
  'memory/naming',
  'memory/pattern',
  'memory/anti-pattern',
  'memory/raw',
  'memory/compound',
  'cache',
  'exports',
];
const REQUIRED_FILES = [
  'SKILL.md',
  'src/taste-extract.js',
  'src/taste-commands.js',
  'src/taste-injector.js',
  'src/taste-share.js',
  'src/taste-watch.js',
  'memory/MEMORY.md',
];

let ok = true;
let fixed = 0;

console.log('Taste Engine — Setup & Health Check');
console.log('');

// 1. Check directories
console.log('[1/4] Directories...');
for (const d of REQUIRED_DIRS) {
  const full = TASTE_DIR + '/' + d;
  if (!fs.existsSync(full)) {
    try { fs.mkdirSync(full, { recursive: true }); console.log('  + created  ' + d); fixed++; }
    catch (e) { console.log('  ✗ FAIL     ' + d + ': ' + e.message); ok = false; }
  }
}
if (!fixed) console.log('  ✓ all exist');
fixed = 0;

// 2. Check files
console.log('[2/4] Core files...');
for (const f of REQUIRED_FILES) {
  const full = TASTE_DIR + '/' + f;
  if (!fs.existsSync(full)) {
    console.log('  ✗ MISSING  ' + f);
    ok = false;
  }
}
if (ok) console.log('  ✓ all present');

// 3. Check hooks in settings.json
console.log('[3/4] Hooks...');
const settingsPath = HOME + '/.claude/settings.json';
if (fs.existsSync(settingsPath)) {
  const content = fs.readFileSync(settingsPath, 'utf8');
  const hasExtractHook = content.includes('taste-extract.js');
  const hasInjectHook = content.includes('taste-injector.js');
  if (hasExtractHook) console.log('  ✓ PostToolUse (extract)');
  else { console.log('  ✗ MISSING  PostToolUse extract hook'); ok = false; }
  if (hasInjectHook) console.log('  ✓ PostToolUse (inject)');
  else { console.log('  ✗ MISSING  PostToolUse inject hook'); ok = false; }
} else {
  console.log('  ⚠ settings.json not found');
}

// 4. Check CLAUDE.md entry
console.log('[4/4] CLAUDE.md...');
const claudeMdPath = HOME + '/.claude/CLAUDE.md';
if (fs.existsSync(claudeMdPath)) {
  const claudeMd = fs.readFileSync(claudeMdPath, 'utf8');
  if (claudeMd.includes('taste')) console.log('  ✓ taste entry in CLAUDE.md');
  else { console.log('  ✗ MISSING  taste entry in CLAUDE.md'); ok = false; }
} else {
  console.log('  ⚠ CLAUDE.md not found');
}

// 5. Quick functional test
console.log('');
console.log('  Running quick functional test...');
const testResult = spawnSync('node', [TASTE_DIR + '/scripts/taste-commands.js', 'status'], {
  timeout: 5000,
  stdio: 'pipe',
});
if (testResult.status === 0) {
  const out = testResult.stdout.toString();
  const count = (out.match(/Patterns learned:\s+(\d+)/) || [])[1] || '0';
  console.log('  ✓ status command works (' + count + ' patterns)');
} else {
  console.log('  ✗ status command failed');
  ok = false;
}

console.log('');
if (ok) {
  console.log('✓ All systems ready. Taste Engine will learn from every edit.');
} else {
  console.log('✗ Some checks failed — review above.');
  process.exit(1);
}
