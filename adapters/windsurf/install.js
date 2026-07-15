#!/usr/bin/env node
/**
 * Windsurf adapter — Installer
 *
 * Sets up .windsurf/rules/taste.md for Windsurf IDE.
 *
 * Windsurf reads .windsurf/rules/ as context for its Cascade agent.
 * Each .md file in that directory is loaded as a rule.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TASTE_DIR = path.resolve(__dirname, '../..');
const INJECT = TASTE_DIR + '/adapters/shared/taste-platform-inject.js';

function install(projectDir) {
  projectDir = projectDir || process.cwd();
  const rulesDir = path.join(projectDir, '.windsurf', 'rules');
  const tasteFile = path.join(rulesDir, 'taste.md');

  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  // Get current injection
  const injectResult = spawnSync('node', [INJECT, '--target', 'stdout'], {
    timeout: 5000,
    stdio: 'pipe',
  });
  const tasteContent = injectResult.status === 0 ? injectResult.stdout.toString().trim() : 'No preferences learned yet.';

  const frontmatter = '---\nname: taste-profile\ndescription: "Learned coding style preferences from Taste Engine. Auto-generated."\n---\n\n';
  const ruleBody = '# Taste Profile\n\nYour personal coding style preferences, learned from every edit.\nThe model should follow these conventions when generating code.\n\n' + tasteContent + '\n\n## How this file is generated\n\n1. Every file save triggers taste extraction\n2. 40+ classifiers detect patterns in your diffs\n3. Patterns stored in ~/.claude/skills/taste/memory/\n4. This rule is refreshed from strongest patterns\n\nTo refresh: node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target windsurf\n';

  fs.writeFileSync(tasteFile, frontmatter + ruleBody);
  console.log('[windsurf] Wrote ' + tasteFile);

  // Check fswatch availability
  const fswatchCheck = spawnSync('which', ['fswatch'], { stdio: 'pipe' });
  if (fswatchCheck.status === 0) {
    console.log('[windsurf] Tip: auto-refresh with: fswatch -o src/ src/ | xargs -n1 node ' + INJECT + ' --target windsurf &');
  }

  console.log('[windsurf] ✓ Taste Engine active for Windsurf');
}

install(process.argv[2] || process.cwd());
