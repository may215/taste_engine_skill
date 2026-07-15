# Aider Adapter

Integrates Taste Engine with Aider (AI pair programming in terminal) using `CONVENTIONS.md` and a git post-commit hook.

## How It Works

Aider reads `CONVENTIONS.md` as system context for every code generation request. By injecting your taste profile there, Aider generates code matching your learned style.

The git post-commit hook captures every commit's changed files for taste extraction.

## Install

```bash
node ~/.claude/skills/taste/adapters/aider/install.js [project-dir]
```

Creates/updates:
- `CONVENTIONS.md` — Aider conventions file with taste profile
- `.git/hooks/post-commit` — Captures patterns after each commit
- `.aider.conf.yml` — Adds `conventions-file: CONVENTIONS.md`

## Refresh

```bash
node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target aider
```

## Manual Capture

```bash
node ~/.claude/skills/taste/adapters/aider/hook.js --last-commit
```
