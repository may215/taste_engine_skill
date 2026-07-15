# Windsurf Adapter

Integrates Taste Engine with Windsurf IDE using `.windsurf/rules/taste.md`.

## How Windsurf Rules Work

Windsurf's Cascade agent reads `.windsurf/rules/` as system context. Every `.md` file in this directory is loaded and influences code generation. By injecting your taste profile there, Cascade generates code matching your style.

## Install

```bash
node ~/.claude/skills/taste/adapters/windsurf/install.js [project-dir]
```

Creates:
- `.windsurf/rules/taste.md` — taste profile as a Cascade rule

## Refresh

```bash
node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target windsurf
```

For auto-refresh on file changes (requires fswatch):
```bash
brew install fswatch
fswatch -o src/ | xargs -n1 node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target windsurf &
```
