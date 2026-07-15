#!/usr/bin/env node
/**
 * Claude Code adapter — Installer
 *
 * Sets up PostToolUse hooks in settings.json and taste entry in CLAUDE.md
 * for Claude Code integration.
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const TASTE_DIR = path.resolve(__dirname, '../..');
const CLAUDE_DIR = HOME + '/.claude';
const SETTINGS_FILE = CLAUDE_DIR + '/settings.json';
const CLAUDE_MD_FILE = CLAUDE_DIR + '/CLAUDE.md';

function install() {
  console.log('── Claude Code Adapter ──');
  let settingsChanged = false;

  // 1. settings.json hooks
  if (fs.existsSync(SETTINGS_FILE)) {
    let settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

    const existingExtract = settings.hooks.PostToolUse.some(h =>
      h.hooks && h.hooks.some(hh => hh.command && hh.command.includes('taste-extract'))
    );
    if (!existingExtract) {
      settings.hooks.PostToolUse.push({
        matcher: 'Write|Edit',
        hooks: [{
          type: 'command',
          command: 'node ' + TASTE_DIR + '/src/taste-extract.js "${FILE}" --accept --diff "${DIFF}" 2>/dev/null || true',
          timeout: 3000,
          statusMessage: 'taste: extracting patterns...',
        }],
      });
      settingsChanged = true;
    }

    const existingInject = settings.hooks.PostToolUse.some(h =>
      h.hooks && h.hooks.some(hh => hh.command && hh.command.includes('taste-injector'))
    );
    if (!existingInject) {
      settings.hooks.PostToolUse.push({
        matcher: '*',
        hooks: [{
          type: 'command',
          command: 'node ' + TASTE_DIR + '/src/taste-injector.js --check 2>/dev/null || node ' + TASTE_DIR + '/src/taste-injector.js --project "${PWD}" 2>/dev/null || true',
          timeout: 2000,
          statusMessage: 'taste: loading profile...',
        }],
      });
      settingsChanged = true;
    }

    if (settingsChanged) {
      // Preserve existing formatting by re-stringifying
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
      console.log('  ✓ Updated PostToolUse hooks in settings.json');
    } else {
      console.log('  ✓ Hooks already configured');
    }
  } else {
    console.log('  ⚠ settings.json not found at ' + SETTINGS_FILE);
    console.log('  ⚠ Create it manually per INSTALL.md instructions');
  }

  // 2. CLAUDE.md entry
  if (fs.existsSync(CLAUDE_MD_FILE)) {
    let claudeMd = fs.readFileSync(CLAUDE_MD_FILE, 'utf8');
    if (!claudeMd.includes('# taste') && !claudeMd.includes('taste-engine')) {
      const tasteSection = '\n# taste\n- **taste** (' + TASTE_DIR + '/SKILL.md) — learns coding patterns from accepted/rejected edits\n- \`/taste\` — manages the taste profile. Subcommands: \`list\`, \`show <p>\`, \`search <q>\`, \`forget <p>\`, \`reset\`, \`status\`, \`decay\`, \`compound\`\n- On session start, read ' + TASTE_DIR + '/cache/active-taste.md if it exists and use those preferences to guide generated code\n';
      claudeMd += tasteSection;
      fs.writeFileSync(CLAUDE_MD_FILE, claudeMd);
      console.log('  ✓ Updated CLAUDE.md with taste entry');
    } else {
      console.log('  ✓ CLAUDE.md already has taste entry');
    }
  } else {
    console.log('  ⚠ CLAUDE.md not found');
  }

  console.log('  ✓ Claude Code adapter installed');
  console.log('');
  console.log('Taste Engine will now:');
  console.log('  1. Extract patterns from every Write/Edit tool use');
  console.log('  2. Inject profile into every new session');
  console.log('  3. Learn and adapt as you code');
}

install();
