#!/usr/bin/env node
/**
 * Cursor adapter — Installer
 *
 * Sets up .cursor/rules/taste.mdc and .cursorrules for Cursor IDE.
 *
 * Cursor supports two mechanisms:
 *   1. .cursor/rules/ — per-project rules with frontmatter (Cursor 0.45+)
 *   2. .cursorrules — global project-level rules file
 *
 * We use .cursor/rules/taste.mdc (the newer, richer format)
 * and optionally inject into .cursorrules as a fallback.
 */

const fs = require('fs');
const path = require('path');

const TASTE_DIR = path.resolve(__dirname, '../..');
const CAPTURE = TASTE_DIR + '/adapters/shared/taste-platform-capture.js';

function install(projectDir) {
  projectDir = projectDir || process.cwd();
  const rulesDir = path.join(projectDir, '.cursor', 'rules');
  const rulesFile = path.join(rulesDir, 'taste.mdc');
  const cursorrulesFile = path.join(projectDir, '.cursorrules');
  const gitignoreFile = path.join(projectDir, '.gitignore');

  // Ensure .cursor/rules/ exists
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  // Write .cursor/rules/taste.mdc
  const tasteRule = `---
description: Taste Engine — learned coding preferences
globs: *.ts, *.tsx, *.js, *.jsx, *.py, *.go, *.rs, *.css, *.scss
---

# Taste Preferences

This project uses Taste Engine to learn coding patterns from edits.

## How it works

- Every file save triggers taste extraction
- Patterns are stored in ~/.claude/skills/taste/memory/
- The injector generates this file from learned patterns

## Active preferences

${getInjectionContent()}

## When generating code

Follow the conventions above unless explicitly overridden.
If none listed, generate clean, conventional code matching the project's existing style.
`;

  fs.writeFileSync(rulesFile, tasteRule);
  console.log('[cursor] Wrote ' + rulesFile);

  // Also update .cursorrules as a secondary target
  if (fs.existsSync(cursorrulesFile)) {
    let content = fs.readFileSync(cursorrulesFile, 'utf8');
    if (!content.includes('Taste Engine')) {
      content += '\n\n' + tasteRule;
      fs.writeFileSync(cursorrulesFile, content);
      console.log('[cursor] Appended to ' + cursorrulesFile);
    }
  }

  // Add to .gitignore suggestion
  if (fs.existsSync(gitignoreFile)) {
    let gi = fs.readFileSync(gitignoreFile, 'utf8');
    const entriesToAdd = [];
    if (!gi.includes('.cursorrules')) entriesToAdd.push('.cursorrules');
    if (entriesToAdd.length > 0) {
      fs.appendFileSync(gitignoreFile, '\n# Taste Engine (Cursor adapter)\n' + entriesToAdd.join('\n') + '\n');
      console.log('[cursor] Updated .gitignore');
    }
  }

  console.log('[cursor] ✓ Taste Engine active for Cursor');
}

function getInjectionContent() {
  try {
    const { spawnSync } = require('child_process');
    const injector = TASTE_DIR + '/adapters/shared/taste-platform-inject.js';
    const result = spawnSync('node', [injector, '--target', 'stdout'], {
      timeout: 5000,
      stdio: 'pipe',
    });
    if (result.status === 0) {
      return result.stdout.toString().trim();
    }
  } catch (e) {}
  return 'No preferences learned yet. Edit some code to build your taste profile.';
}

function main() {
  const args = process.argv.slice(2);
  const projectDir = args[0] || process.cwd();
  install(projectDir);
}

main();
