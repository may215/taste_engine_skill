#!/usr/bin/env node
/**
 * Continue.dev adapter — Installer
 *
 * Sets up Continue.dev config.json with:
 *   1. An onSave hook that captures edits for taste extraction
 *   2. A custom context provider "@Taste" that injects the profile
 *
 * Continue.dev config reference:
 *   https://docs.continue.dev/customize/config-file
 */

const fs = require('fs');
const path = require('path');

const TASTE_DIR = path.resolve(__dirname, '../..');
const CAPTURE = TASTE_DIR + '/adapters/shared/taste-platform-capture.js';
const INJECT = TASTE_DIR + '/adapters/shared/taste-platform-inject.js';

function install(projectDir) {
  projectDir = projectDir || process.cwd();
  const continueDir = path.join(projectDir, '.continue');
  const configFile = path.join(continueDir, 'config.json');

  if (!fs.existsSync(continueDir)) {
    fs.mkdirSync(continueDir, { recursive: true });
  }

  let config = {};
  if (fs.existsSync(configFile)) {
    try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (e) {}
  }

  // Add onSave hook for taste capture
  if (!config.onSave) config.onSave = [];
  const captureHook = {
    match: '*.{ts,tsx,js,jsx,py,go,rs,css,scss}',
    command: 'node ' + CAPTURE + ' ${file}',
  };
  const hasHook = config.onSave.some(h => h.command && h.command.includes('taste-platform-capture'));
  if (!hasHook) {
    config.onSave.push(captureHook);
  }

  // Add custom context provider for @Taste
  if (!config.contextProviders) config.contextProviders = [];
  const tasteProvider = {
    name: 'Taste',
    description: 'Your learned coding style preferences',
    command: 'node ' + INJECT + ' --target stdout',
  };
  const hasProvider = config.contextProviders.some(p => p.name === 'Taste');
  if (!hasProvider) {
    config.contextProviders.push(tasteProvider);
  }

  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  console.log('[continue] Updated ' + configFile);

  // Also write the current taste profile as a markdown file
  const tasteDocFile = path.join(continueDir, 'taste-prompt.md');
  const injectResult = require('child_process').spawnSync('node', [INJECT, '--target', 'stdout'], {
    timeout: 5000,
    stdio: 'pipe',
  });
  const tasteContent = injectResult.status === 0 ? injectResult.stdout.toString().trim() : 'No preferences learned yet.';
  fs.writeFileSync(tasteDocFile, '# Taste Profile\n\n' + tasteContent + '\n\nUse `@Taste` in chat to load this profile.\n');
  console.log('[continue] Wrote ' + tasteDocFile);

  console.log('[continue] ✓ Taste Engine active for Continue.dev');
  console.log('[continue]   Use @Taste in chat to load your profile');
}

install(process.argv[2] || process.cwd());
