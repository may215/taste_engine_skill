# Cline Adapter

Integrates Taste Engine with Cline (AI assistant in VS Code) through MCP + CLAUDE.md.

## How It Works

Cline supports two mechanisms we use:

1. **CLAUDE.md** — Project-level instructions that Cline reads on session start. We inject the taste profile path here.
2. **MCP Servers** — Custom tools Cline can call during a session. We provide tools like `get_taste_profile`, `forget_pattern`, etc.

## Install

```bash
node ~/.claude/skills/taste/adapters/cline/install.js [project-dir]
```

Creates/updates:
- `.claude/CLAUDE.md` — Instructions to follow taste profile
- `.cline/mcp.json` — MCP server registration
- Taste engine cache files

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_taste_profile` | Returns your current top-7 preferences |
| `list_patterns` | Lists all patterns (optionally filtered by category) |
| `show_pattern` | Full detail of a specific pattern |
| `forget_pattern` | Remove a pattern by name |
| `refresh_profile` | Force re-injection of profile |

## Manual Refresh

```bash
node ~/.claude/skills/taste/adapters/shared/taste-platform-inject.js --target claudemd
```
