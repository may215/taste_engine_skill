# Installation Guide

Three install methods — pick one.

---

## Method 1: One-Line Install (Recommended)

```bash
# Clone into Claude Code's skills directory
git clone https://github.com/claude-code/taste-engine.git ~/.claude/skills/taste

# Run setup
node ~/.claude/skills/taste/src/taste-init.js
```

This creates the directory structure, verifies all files are present, checks that hooks and CLAUDE.md are configured, and runs a quick functional test.

---

## Method 2: Manual Setup

### Step 1 — Clone the repo

```bash
git clone https://github.com/claude-code/taste-engine.git ~/.claude/skills/taste
```

### Step 2 — Add PostToolUse hooks

Open `~/.claude/settings.json` and add to the `hooks` section:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node $HOME/.claude/skills/taste/src/taste-extract.js \"$FILE\" --accept --diff \"$DIFF\" 2>/dev/null || true",
            "timeout": 3000,
            "statusMessage": "taste: extracting patterns..."
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node $HOME/.claude/skills/taste/src/taste-injector.js --check 2>/dev/null || node $HOME/.claude/skills/taste/src/taste-injector.js --project \"$PWD\" 2>/dev/null || true",
            "timeout": 2000,
            "statusMessage": "taste: loading profile..."
          }
        ]
      }
    ]
  }
}
```

### Step 3 — Add CLAUDE.md entry

Open `~/.claude/CLAUDE.md` and add:

```markdown
# taste
- **taste** (`~/.claude/skills/taste/SKILL.md`) — learns coding patterns from edits
- `/taste` — manage taste profile. Subcommands: `list`, `show`, `search`, `forget`, `reset`, `status`, `decay`, `compound`, `init`
- Taste profile auto-injects on session start — read `~/.claude/skills/taste/cache/active-taste.md` if it exists
```

### Step 4 — Verify

```bash
node ~/.claude/skills/taste/src/taste-init.js
```

---

## Method 3: npm (Coming Soon)

```bash
npm install -g @claude-code/taste-engine
# Install in Claude Code
taste-init
```

---

## Post-Installation

### Verify the hook works

Make an edit through Claude Code. You should see "taste: extracting patterns..." briefly in the status bar.

### Check your profile

```
/taste status
/taste list
```

### Set up the file watcher (optional)

For manual edits outside Claude Code:

```bash
/taste watch --project
```

This watches your project directory for file saves. Requires `fswatch` (`brew install fswatch`) or falls back to Node.js `fs.watch`.

---

## Requirements

| Dependency | Version | Notes |
|-----------|---------|-------|
| Node.js | 18+ | Tested on 18, 20, 22 |
| Claude Code | latest | CLI tool (not the API) |
| fswatch (optional) | latest | `brew install fswatch` for file watcher |

## Uninstall

```bash
# Remove hooks from settings.json
# Remove entry from CLAUDE.md
rm -rf ~/.claude/skills/taste
```
