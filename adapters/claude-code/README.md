# Claude Code Adapter

Installs Taste Engine hooks and CLAUDE.md entry for Claude Code.

## Install

```bash
node ~/.claude/skills/taste/adapters/claude-code/install.js
```

This configures:
- **PostToolUse hooks** — extracts patterns after every Write/Edit, injects profile once per session
- **CLAUDE.md entry** — tells the model to read `active-taste.md` and follow preferences

## What Gets Installed

### settings.json hooks

Two PostToolUse hooks:
1. `Write|Edit` → `taste-extract.js` — captures patterns from every accepted edit
2. `*` → `taste-injector.js` — writes top-7 patterns to `active-taste.md` once per session

### CLAUDE.md

Instructions telling Claude to read `~/.claude/skills/taste/cache/active-taste.md` on session start and follow the preferences.

## Uninstall

Remove the two PostToolUse entries from `~/.claude/settings.json` and the taste section from `~/.claude/CLAUDE.md`.
