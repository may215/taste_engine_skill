#!/usr/bin/env node
/**
 * Cline MCP Server — exposes Taste Engine as MCP tools.
 *
 * Provides tools:
 *   get_taste_profile  — Returns current taste profile
 *   list_patterns      — List all learned patterns
 *   refresh_profile    — Force re-injection
 *
 * Cline connects to this via .cline/mcp.json.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TASTE_DIR = process.env.HOME + '/.claude/skills/taste';
const COMMANDS = TASTE_DIR + '/src/taste-commands.js';
const INJECT = TASTE_DIR + '/adapters/shared/taste-platform-inject.js';
const MEMORY_DIR = TASTE_DIR + '/memory';

// ── MCP stdio transport ─────────────────────────────────────────────────────

function sendMessage(msg) {
  const line = JSON.stringify(msg);
  process.stdout.write(line + '\n');
}

function readMessage() {
  return new Promise((resolve) => {
    let buffer = '';
    process.stdin.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          resolve(JSON.parse(line));
        } catch (e) {}
      }
    });
  });
}

// ── Tool handlers ───────────────────────────────────────────────────────────

function runCommand(...args) {
  const result = spawnSync('node', args, { timeout: 5000, stdio: 'pipe' });
  return result.status === 0 ? result.stdout.toString().trim() : 'Error: ' + (result.stderr ? result.stderr.toString().trim() : 'unknown');
}

function getToolsList() {
  return [
    {
      name: 'get_taste_profile',
      description: 'Return the current taste profile (top 7 learned preferences)',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'list_patterns',
      description: 'List all learned coding patterns with strength',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Filter by category: formatting, naming, pattern, anti-pattern',
            enum: ['formatting', 'naming', 'pattern', 'anti-pattern', ''],
          },
        },
      },
    },
    {
      name: 'refresh_profile',
      description: 'Force re-injection of the taste profile',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'show_pattern',
      description: 'Show details of a specific pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pattern name (e.g. arrow-functions)' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'forget_pattern',
      description: 'Remove a learned pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pattern name to remove' },
        },
        required: ['pattern'],
      },
    },
  ];
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'get_taste_profile': {
      const content = runCommand(INJECT, '--target', 'stdout');
      return { content: [{ type: 'text', text: content }] };
    }
    case 'list_patterns': {
      const category = args?.category || '';
      const output = runCommand(COMMANDS, 'list', category);
      return { content: [{ type: 'text', text: output }] };
    }
    case 'refresh_profile': {
      const output = runCommand(INJECT, '--target', 'claudemd');
      return { content: [{ type: 'text', text: 'Profile refreshed: ' + output }] };
    }
    case 'show_pattern': {
      if (!args?.pattern) return { content: [{ type: 'text', text: 'Missing pattern name' }] };
      const output = runCommand(COMMANDS, 'show', args.pattern);
      return { content: [{ type: 'text', text: output }] };
    }
    case 'forget_pattern': {
      if (!args?.pattern) return { content: [{ type: 'text', text: 'Missing pattern name' }] };
      const output = runCommand(TASTE_DIR + '/src/taste-extract.js', '--forget', args.pattern);
      return { content: [{ type: 'text', text: output }] };
    }
    default:
      return { content: [{ type: 'text', text: 'Unknown tool: ' + name }] };
  }
}

// ── Main MCP loop ───────────────────────────────────────────────────────────

async function main() {
  // Initialize
  sendMessage({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'taste-engine',
        version: '2.0.0',
      },
    },
  });

  // Notify server started
  sendMessage({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });

  // Message loop
  while (true) {
    const msg = await readMessage();
    if (!msg) continue;

    const { id, method, params } = msg;

    switch (method) {
      case 'tools/list': {
        sendMessage({
          jsonrpc: '2.0',
          id,
          result: { tools: getToolsList() },
        });
        break;
      }
      case 'tools/call': {
        const result = await handleToolCall(params.name, params.arguments);
        sendMessage({
          jsonrpc: '2.0',
          id,
          result,
        });
        break;
      }
      case 'shutdown':
        process.exit(0);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
