# Cursor Adapter

Installs Taste Engine into Cursor IDE using `.cursor/rules/taste.mdc` and `.cursorrules`.

## Install

```bash
node ~/.claude/skills/taste/adapters/cursor/install.js [project-dir]
```

This creates:
- `.cursor/rules/taste.mdc` — rule with current taste profile
- Appends to `.cursorrules` if it exists
- Updates `.gitignore` with adapter artifacts

## How it works

1. `install.js` creates a Cursor rule that loads your taste profile
2. On file save, `hook.js` runs the shared capture adapter
3. Patterns are extracted and stored in `~/.claude/skills/taste/memory/`
4. Run `node .../taste-platform-inject.js --target cursorrules` to refresh injected rules

## Refresh

```bash
node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target cursorrules
```
