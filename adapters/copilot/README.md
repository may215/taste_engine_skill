# GitHub Copilot Adapter

Integrates Taste Engine with GitHub Copilot using `.github/copilot-instructions.md`.

## How Copilot Instructions Work

GitHub Copilot reads `.github/copilot-instructions.md` as additional context for every
code generation request. By injecting your taste profile there, Copilot generates
code that matches your learned preferences.

## Install

```bash
node ~/.claude/skills/taste/adapters/copilot/install.js [project-dir]
```

Creates:
- `.github/copilot-instructions.md` — Copilot context with taste profile
- `.vscode/tasks.json` — Optional on-save capture task (VS Code only)

## Refresh

```bash
node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target copilot-instructions
```

## Limitations

- Copilot only reads instructions at session start. You may need to reload the window
  for profile changes to take effect.
- Copilot has a context window limit — a very large taste profile may be truncated.
  The injector caps at 7 patterns to stay concise.
