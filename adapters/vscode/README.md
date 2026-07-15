# VS Code Extension Adapter

A workspace-level VS Code extension that integrates Taste Engine directly into your editor.

## Features

- **Auto-capture** — Watches file saves and runs taste extraction silently
- **Status bar** — Shows pattern count at a glance (e.g. `♥ Taste: 12`)
- **Commands** — Four commands accessible from the command palette
- **Configuration** — Enable/disable via VS Code settings

## Install

```bash
node ~/.claude/skills/taste/adapters/vscode/install.js [project-dir]
```

Then in VS Code:
1. Open Command Palette (Cmd+Shift+P)
2. "Developer: Install Extension from Location..."
3. Select: `.vscode/taste-engine/`
4. Reload window

## Commands

| Command | Description |
|---------|-------------|
| `Taste: Show Profile` | Shows current top preferences |
| `Taste: List All Patterns` | Lists all learned patterns with strength |
| `Taste: Refresh Profile` | Forces profile re-injection |
| `Taste: Engine Status` | Shows engine health and counts |

## Status Bar

The extension adds a status bar item showing pattern count.
Click it to open your taste profile.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `taste.enabled` | `true` | Enable/disable auto-capture on save |
