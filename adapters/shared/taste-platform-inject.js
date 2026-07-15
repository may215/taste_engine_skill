#!/usr/bin/env node
/**
 * taste-platform-inject.js — Shared injection adapter for any platform.
 *
 * Generates a taste profile injection and writes it to a platform-specific target.
 *
 * Usage:
 *   taste-platform-inject.js --target <cursorrules|copilot-instructions|claudemd|continue|windsurf|aider|stdout>
 *   taste-platform-inject.js --target <file-path>
 *   taste-platform-inject.js --check <target>
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = process.env.HOME;
const TASTE_DIR = HOME + '/.claude/skills/taste';
// Support both repo layout (src/) and deployed layout (scripts/)
const COMMANDS = fs.existsSync(TASTE_DIR + '/src/taste-commands.js')
  ? TASTE_DIR + '/src/taste-commands.js'
  : TASTE_DIR + '/scripts/taste-commands.js';

const TARGETS = {
  'cursorrules': {
    file: () => process.cwd() + '/.cursorrules',
    preamble: '',
    format: (content) => content,
  },
  'copilot-instructions': {
    file: () => process.cwd() + '/.github/copilot-instructions.md',
    preamble: '\n## Taste Profile (auto-generated)\n',
    format: (content) => content,
  },
  'claudemd': {
    file: () => {
      const local = process.cwd() + '/.claude/CLAUDE.md';
      if (fs.existsSync(local)) return local;
      return HOME + '/.claude/CLAUDE.md';
    },
    preamble: '\n# taste\n- Taste profile: ' + TASTE_DIR + '/cache/active-taste.md\n- Follow the preferences listed in that file for code style.\n',
    format: (content) => content,
  },
  'continue': {
    file: () => process.cwd() + '/.continue/config.json',
    preamble: '',
    format: (content) => content,
  },
  'windsurf': {
    file: () => process.cwd() + '/.windsurf/rules/taste.md',
    preamble: '---\nname: taste-profile\ndescription: Auto-generated taste preferences\n---\n\n',
    format: (content) => {
      return content;
    },
  },
  'aider': {
    file: () => process.cwd() + '/CONVENTIONS.md',
    preamble: '\n# Taste Profile (auto-generated)\n\n',
    format: (content) => content,
  },
  'stdout': {
    file: () => null,
    preamble: '',
    format: (content) => content,
    noFile: true,
  },
};

function getInjection() {
  const result = spawnSync('node', [COMMANDS, 'inject'], {
    timeout: 5000,
    stdio: 'pipe',
  });
  if (result.status !== 0) return null;
  return result.stdout.toString().trim();
}

function inject(targetName) {
  const target = TARGETS[targetName];
  if (!target) {
    console.error('Unknown target: ' + targetName);
    console.error('Available: ' + Object.keys(TARGETS).join(', '));
    process.exit(1);
  }

  const injection = getInjection();
  if (!injection) {
    console.log('No taste patterns to inject');
    process.exit(0);
  }

  const filePath = target.file();

  // stdout target: just print
  if (target.noFile) {
    console.log(target.preamble + target.format(injection));
    return;
  }

  const dir = filePath ? path.dirname(filePath) : '';
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const formatted = target.preamble + target.format(injection) + '\n';
  fs.writeFileSync(filePath, formatted);
  console.log('Injected to ' + targetName + ' (' + filePath + ')');
}

function check(targetName) {
  const target = TARGETS[targetName];
  if (!target) return false;
  const filePath = target.file();
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes('taste') || content.includes('Taste');
  }
  return false;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--check')) {
    const target = args[args.indexOf('--check') + 1];
    process.exit(check(target) ? 0 : 1);
  }

  if (args.includes('--target')) {
    const target = args[args.indexOf('--target') + 1];
    inject(target);
    return;
  }

  if (args.includes('--all')) {
    for (const name of Object.keys(TARGETS)) {
      if (name === 'stdout') continue;
      try { inject(name); } catch(e) { console.error('Failed: ' + name); }
    }
    return;
  }

  console.log('Usage:');
  console.log('  taste-platform-inject.js --target <target>    Inject to platform');
  console.log('  taste-platform-inject.js --all                Inject to all platforms');
  console.log('  taste-platform-inject.js --check <target>     Check if injected');
  console.log('');
  console.log('Targets: ' + Object.keys(TARGETS).join(', '));
}

main();
