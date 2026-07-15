#!/usr/bin/env node
/**
 * Cline adapter — Installer
 *
 * Sets up Cline (AI assistant in VS Code) with Taste Engine through:
 *   1. MCP server — exposes taste profile as tools
 *   2. CLAUDE.md — tells Cline to follow the profile
 *
 * Cline reads CLAUDE.md project instructions and can connect custom MCP servers.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TASTE_DIR = path.resolve(__dirname, '../..');
const INJECT = TASTE_DIR + '/adapters/shared/taste-platform-inject.js';

function install(projectDir) {
  projectDir = projectDir || process.cwd();
  const claudeDir = path.join(projectDir, '.claude');
  const claudeMdFile = path.join(claudeDir, 'CLAUDE.md');
  const mcpDir = path.join(projectDir, '.cline', 'mcp');

  // ── 1. Add to CLAUDE.md ──
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  let claudeContent = '';
  if (fs.existsSync(claudeMdFile)) {
    claudeContent = fs.readFileSync(claudeMdFile, 'utf8');
  }

  const tasteSection = '\n# taste\n- Taste profile: ' + TASTE_DIR + '/cache/active-taste.md\n- Follow the preferences in that file for code style.\n- Run `node ' + INJECT + ' --target claudemd` to refresh.\n';

  if (!claudeContent.includes('Taste Engine') && !claudeContent.includes('# taste')) {
    claudeContent += tasteSection;
    fs.writeFileSync(claudeMdFile, claudeContent);
    console.log('[cline] Updated ' + claudeMdFile);
  }

  // ── 2. Generate CLAUDE.md injection ──
  const injectResult = spawnSync('node', [INJECT, '--target', 'stdout'], {
    timeout: 5000,
    stdio: 'pipe',
  });
  const tasteContent = injectResult.status === 0 ? injectResult.stdout.toString().trim() : 'No preferences learned yet.';

  // Write active-taste.md (same file Claude Code uses, so Cline can share it)
  const activeTasteFile = TASTE_DIR + '/cache/active-taste.md';
  if (!fs.existsSync(path.dirname(activeTasteFile))) {
    fs.mkdirSync(path.dirname(activeTasteFile), { recursive: true });
  }
  fs.writeFileSync(activeTasteFile, tasteContent);

  // ── 3. MCP server config ──
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true });
  }

  const mcpConfig = {
    mcpServers: {
      'taste-engine': {
        command: 'node',
        args: [TASTE_DIR + '/adapters/cline/mcp-server.js'],
        description: 'Taste Engine — learned coding preferences',
      },
    },
  };

  // Write to .cline/mcp.json (Cline's MCP config file)
  const mcpConfigFile = path.join(projectDir, '.cline', 'mcp.json');
  if (fs.existsSync(mcpConfigFile)) {
    let existing = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf8'));
    if (!existing.mcpServers || !existing.mcpServers['taste-engine']) {
      Object.assign(existing.mcpServers || {}, mcpConfig.mcpServers);
      fs.writeFileSync(mcpConfigFile, JSON.stringify(existing, null, 2));
      console.log('[cline] Updated MCP config at ' + mcpConfigFile);
    }
  } else {
    fs.writeFileSync(mcpConfigFile, JSON.stringify(mcpConfig, null, 2));
    console.log('[cline] Created MCP config at ' + mcpConfigFile);
  }

  // ── 4. Create a capture hook for Cline ──
  const hooksFile = path.join(claudeDir, 'hooks.json');
  if (fs.existsSync(hooksFile)) {
    let hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
    if (!hooks.PostToolUse) hooks.PostToolUse = [];
    const hasCapture = hooks.PostToolUse.some(h => h.command && h.command.includes('taste'));
    if (!hasCapture) {
      hooks.PostToolUse.push({
        matcher: 'Write|Edit',
        hooks: [
          {
            type: 'command',
            command: 'node ' + TASTE_DIR + '/adapters/cline/hook.js "${FILE}"',
            timeout: 3000,
          },
        ],
      });
      fs.writeFileSync(hooksFile, JSON.stringify(hooks, null, 2));
      console.log('[cline] Updated hooks at ' + hooksFile);
    }
  }

  console.log('[cline] ✓ Taste Engine active for Cline');
}

install(process.argv[2] || process.cwd());
