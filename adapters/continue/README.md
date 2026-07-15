# Continue.dev Adapter

Integrates Taste Engine with Continue.dev using `.continue/config.json`.

## How It Works

Continue.dev supports two mechanisms we use:

1. **onSave hooks** — Runs `taste-platform-capture.js` after every file save, capturing patterns
2. **Context providers** — Registers `@Taste` as a chat context provider you can summon with `@Taste`

## Install

```bash
node ~/.claude/skills/taste/adapters/continue/install.js [project-dir]
```

Creates/updates:
- `.continue/config.json` — onSave hooks + context provider
- `.continue/taste-prompt.md` — Your current taste profile as a doc

## Usage

In Continue.dev chat, type `@Taste` to inject your current profile as context.

## Refresh

```bash
node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target continue
```

Or just use `@Taste` in chat — it runs the inject command live.
