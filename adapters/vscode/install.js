#!/usr/bin/env node
/**
 * VSCode adapter — Installer
 *
 * Creates a VS Code extension that:
 *   1. Watches file saves for taste capture
 *   2. Shows taste status in the status bar
 *   3. Provides commands (Taste: Show Profile, Taste: Forget Pattern, etc.)
 *
 * The extension is workspace-level (not published to marketplace).
 */

const fs = require('fs');
const path = require('path');

const TASTE_DIR = path.resolve(__dirname, '../..');

function install(projectDir) {
  projectDir = projectDir || process.cwd();
  const vscodeDir = path.join(projectDir, '.vscode');

  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  // ── Extension source ──
  const extDir = path.join(vscodeDir, 'taste-engine');
  if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir, { recursive: true });
  }

  // Write package.json for the extension
  const pkgJson = {
    name: 'taste-engine',
    displayName: 'Taste Engine',
    description: 'Learns your coding patterns from edits and shows taste profile',
    version: '2.0.0',
    publisher: 'taste-engine',
    engines: { vscode: '^1.85.0' },
    categories: ['Other'],
    activationEvents: ['onStartupFinished'],
    main: './extension.js',
    contributes: {
      commands: [
        { command: 'taste.showProfile', title: 'Taste: Show Profile' },
        { command: 'taste.listPatterns', title: 'Taste: List All Patterns' },
        { command: 'taste.refresh', title: 'Taste: Refresh Profile' },
        { command: 'taste.status', title: 'Taste: Engine Status' },
      ],
      configuration: {
        title: 'Taste Engine',
        properties: {
          'taste.enabled': { type: 'boolean', default: true, description: 'Enable taste capture' },
        },
      },
    },
  };
  fs.writeFileSync(path.join(extDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // Write extension.js
  const extensionJs = `/**
 * Taste Engine — VS Code Extension
 *
 * Captures edits, shows status bar with pattern count,
 * registers commands for taste management.
 */
const vscode = require('vscode');
const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TASTE_DIR = path.resolve(__dirname, '../..');
const CAPTURE = path.join(TASTE_DIR, 'adapters/shared/taste-platform-capture.js');
const COMMANDS = path.join(TASTE_DIR, 'src/taste-commands.js');
const INJECT = path.join(TASTE_DIR, 'adapters/shared/taste-platform-inject.js');

let statusBarItem = null;

function activate(context) {
  console.log('[taste] Extension activated');

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'taste.showProfile';
  context.subscriptions.push(statusBarItem);
  updateStatusBar();

  // File save capture
  const enabled = vscode.workspace.getConfiguration('taste').get('enabled', true);
  if (enabled) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const filePath = doc.uri.fsPath;
        if (!filePath) return;
        const ext = path.extname(filePath).toLowerCase();
        const skip = ['.png','.jpg','.jpeg','.gif','.webp','.ico','.svg','.woff','.woff2','.ttf',
          '.eot','.mp4','.mp3','.zip','.tar','.gz','.pdf','.lock','.log','.DS_Store'];
        if (skip.includes(ext) || filePath.includes('node_modules') || filePath.includes('.git')) return;
        spawnSync('node', [CAPTURE, filePath], { timeout: 5000, stdio: 'pipe' });
        updateStatusBar();
      })
    );
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('taste.showProfile', () => {
      const result = spawnSync('node', [INJECT, '--target', 'stdout'], { timeout: 5000, encoding: 'utf8' });
      vscode.window.showInformationMessage('Taste Profile loaded', 'View Details').then(() => {
        vscode.window.showInformationMessage(result.stdout || 'No patterns learned yet');
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('taste.listPatterns', () => {
      const result = spawnSync('node', [COMMANDS, 'list'], { timeout: 5000, encoding: 'utf8' });
      vscode.window.showInformationMessage(result.stdout.trim() || 'No patterns');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('taste.refresh', () => {
      spawnSync('node', [INJECT, '--target', 'copilot-instructions'], { timeout: 5000, stdio: 'pipe' });
      vscode.window.showInformationMessage('Taste profile refreshed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('taste.status', () => {
      const result = spawnSync('node', [COMMANDS, 'status'], { timeout: 5000, encoding: 'utf8' });
      vscode.window.showInformationMessage(result.stdout || 'Engine not initialized');
    })
  );
}

function updateStatusBar() {
  try {
    const result = spawnSync('node', [COMMANDS, 'list'], { timeout: 5000, encoding: 'utf8' });
    const match = result.stdout ? result.stdout.match(/Taste profile \\((\\d+)\\)/) : null;
    const count = match ? match[1] : '0';
    statusBarItem.text = '$(heart) Taste: ' + count;
    statusBarItem.tooltip = count === '0' ? 'No patterns learned yet. Edit some code!' : count + ' patterns learned';
    statusBarItem.show();
  } catch (e) {
    statusBarItem.text = '$(heart) Taste';
    statusBarItem.show();
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
`;

  fs.writeFileSync(path.join(extDir, 'extension.js'), extensionJs);
  console.log('[vscode] Wrote extension to ' + extDir);

  // ── Workspace .vscode/settings.json ──
  const settingsFile = path.join(vscodeDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (e) {}
  }
  settings['taste.enabled'] = true;
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  console.log('[vscode] Updated workspace settings');

  // ── Install instructions ──
  const installMd = path.join(vscodeDir, 'taste-engine', 'README.md');
  const readme = `# Taste Engine VS Code Extension

## Install

1. Open VS Code
2. Run "Developer: Install Extension from Location..."
3. Select: \`${extDir}\`
4. Reload window

## Commands

| Command | Description |
|---------|-------------|
| \`Taste: Show Profile\` | Show current taste profile |
| \`Taste: List All Patterns\` | List all learned patterns |
| \`Taste: Refresh Profile\` | Force re-injection |
| \`Taste: Engine Status\` | Show engine health |

## Settings

- \`taste.enabled\` (boolean) — Enable/disable taste capture
`;
  fs.writeFileSync(installMd, readme);

  console.log('[vscode] ✓ Taste Engine extension ready');
  console.log('[vscode] Install in VS Code: Developer > Install Extension from Location... > ' + extDir);
}

install(process.argv[2] || process.cwd());
