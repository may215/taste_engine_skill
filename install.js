#!/usr/bin/env node
/**
 * Taste Engine — Multi-Platform Installer
 *
 * Detects your platform and installs the right adapter.
 * Usage: node install.js [--all] [--list] [<platform>]
 *
 * Platforms:
 *   claude-code    — Claude Code (default, via hooks + CLAUDE.md)
 *   cursor         — Cursor IDE (.cursor/rules/)
 *   copilot        — GitHub Copilot (.github/copilot-instructions.md)
 *   continue       — Continue.dev (.continue/config.json)
 *   windsurf       — Windsurf IDE (.windsurf/rules/)
 *   cline          — Cline (MCP server + .cline/ config)
 *   aider          — Aider (CONVENTIONS.md + git hook)
 *   vscode         — VS Code extension (.vscode/taste-engine/)
 *   all            — Install all platforms
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TASTE_DIR = __dirname;
const ADAPTERS_DIR = path.join(TASTE_DIR, 'adapters');

const PLATFORMS = {
  'claude-code': { dir: 'claude-code', default: true, description: 'Claude Code (hooks + CLAUDE.md)' },
  'cursor': { dir: 'cursor', description: 'Cursor IDE' },
  'copilot': { dir: 'copilot', description: 'GitHub Copilot' },
  'continue': { dir: 'continue', description: 'Continue.dev' },
  'windsurf': { dir: 'windsurf', description: 'Windsurf IDE' },
  'cline': { dir: 'cline', description: 'Cline' },
  'aider': { dir: 'aider', description: 'Aider' },
  'vscode': { dir: 'vscode', description: 'VS Code Extension' },
};

function detectPlatform() {
  // Try to detect which platforms are available
  const detected = [];

  // Claude Code — check for ~/.claude/settings.json
  if (fs.existsSync(process.env.HOME + '/.claude/settings.json')) {
    detected.push('claude-code');
  }

  // Cursor — check for .cursor
  if (fs.existsSync(path.join(process.cwd(), '.cursor'))) {
    detected.push('cursor');
  }

  // Cline — check for .cline
  if (fs.existsSync(path.join(process.cwd(), '.cline'))) {
    detected.push('cline');
  }

  // Aider — check for .aider.conf.yml
  if (fs.existsSync(path.join(process.cwd(), '.aider.conf.yml'))) {
    detected.push('aider');
  }

  // VS Code — check for .vscode
  if (fs.existsSync(path.join(process.cwd(), '.vscode'))) {
    detected.push('vscode');
  }

  return detected;
}

function installPlatform(platform, projectDir) {
  const info = PLATFORMS[platform];
  if (!info) {
    console.error('Unknown platform: ' + platform);
    console.error('Available: ' + Object.keys(PLATFORMS).join(', '));
    return false;
  }

  const adapterDir = path.join(ADAPTERS_DIR, info.dir);
  const installScript = path.join(adapterDir, 'install.js');

  if (!fs.existsSync(installScript)) {
    console.error('No installer found for ' + platform + ' at ' + installScript);
    return false;
  }

  console.log('');
  console.log('── Installing ' + platform + ' (' + info.description + ') ──');

  const result = spawnSync('node', [installScript, projectDir || process.cwd()], {
    stdio: 'inherit',
    timeout: 15000,
  });

  return result.status === 0;
}

function showHelp() {
  console.log('Taste Engine — Multi-Platform Installer');
  console.log('');
  console.log('Usage: node install.js [options] [platform]');
  console.log('');
  console.log('Options:');
  console.log('  --list       List available platforms');
  console.log('  --all        Install on all platforms');
  console.log('  --detect     Auto-detect and install detected platforms');
  console.log('  --help       Show this help');
  console.log('');
  console.log('Platforms:');
  for (const [name, info] of Object.entries(PLATFORMS)) {
    const marker = info.default ? ' *' : '  ';
    console.log('  ' + marker + ' ' + name.padEnd(15) + info.description);
  }
  console.log('');
  console.log('Examples:');
  console.log('  node install.js                     Install detected platforms');
  console.log('  node install.js cursor              Install only Cursor adapter');
  console.log('  node install.js --all               Install all platforms');
  console.log('  node install.js --detect            Auto-detect and install');
}

function main() {
  const args = process.argv.slice(2);
  const projectDir = args.find(a => !a.startsWith('--')) || process.cwd();

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--list')) {
    console.log('Available platforms:');
    for (const [name, info] of Object.entries(PLATFORMS)) {
      console.log('  ' + name.padEnd(15) + info.description);
    }
    return;
  }

  if (args.includes('--all')) {
    console.log('Installing Taste Engine on all platforms...');
    let success = 0;
    let fail = 0;
    for (const name of Object.keys(PLATFORMS)) {
      if (installPlatform(name, projectDir)) success++;
      else fail++;
    }
    console.log('');
    console.log('Done: ' + success + ' installed, ' + fail + ' failed');
    return;
  }

  if (args.includes('--detect') || args.length === 0) {
    const detected = detectPlatform();
    if (detected.length === 0) {
      console.log('No known platforms detected. Installing Claude Code adapter...');
      installPlatform('claude-code', projectDir);
      console.log('');
      console.log('Tip: Run `node install.js --list` to see all platforms');
      return;
    }
    console.log('Detected platforms: ' + detected.join(', '));
    let success = 0;
    for (const name of detected) {
      if (installPlatform(name, projectDir)) success++;
    }
    console.log('');
    console.log('Done: ' + success + ' installed on detected platforms');
    return;
  }

  // Install specific platform
  const platform = args.find(a => !a.startsWith('--'));
  if (platform) {
    installPlatform(platform, projectDir);
  }
}

main();
