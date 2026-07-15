---
name: taste
description: "Taste engine — learns your coding patterns from accepted/rejected edits and injects them as context in future sessions. 40+ classifiers, diff-aware, compound cross-file detection, profile export/import. Open-source at https://github.com/claude-code/taste-engine"
trigger: /taste
---

# Taste Engine

Learns your coding patterns by observing every Write/Edit. Stores them as structured memory files, injects into session context, supports push/pull sharing.

## Architecture

```
  Edits ──> PostToolUse hook ──> taste-extract.js ──> memory/*.md
                                                           │
  Session start ──> taste-injector.js <─────────────────── join
                                                           │
                                                           v
                                               active-taste.md (read by model)
```

**Hook:** fires on every Write/Edit, analyzes diff for patterns, writes memories.
**Injector:** fires once per session, writes top-7 contextually relevant patterns to `active-taste.md`.
**File watcher:** `taste-watch.js --project` catches manual edits outside Claude Code.

## Commands

| Command | Description |
|---------|-------------|
| `/taste` | Show current taste profile |
| `/taste list [cat]` | List all patterns (filter: formatting/naming/pattern/anti-pattern) |
| `/taste show <p>` | Show pattern details |
| `/taste search <q>` | Search patterns |
| `/taste forget <p>` | Downvote/remove a pattern |
| `/taste reset` | Clear all learned patterns |
| `/taste status` | Engine health + counts |
| `/taste decay` | Fade un-reinforced patterns (5%/day after 14 days) |
| `/taste compound` | Detect cross-file pattern couplings |
| `/taste push` | Export profile as portable JSON |
| `/taste pull <src>` | Import profile from file/URL |
| `/taste watch [dir]` | Start file watcher for manual edits |

## 30+ Classifiers

**Formatting:** imports-grouped, arrow-functions, function-declarations, trailing-semicolons, no-semicolons, single-quotes, double-quotes, indent-space-2, indent-space-4, indent-tabs

**Naming:** camelcase-vars, snake-case-vars, constants-uppercase, pascalcase-types, underscore-private, hash-private, bool-prefix-is, react-components-named, react-components-default

**TypeScript:** prefer-interface, prefer-type, explicit-block-returns, implicit-returns, branded-types, discriminated-unions, strict-null-pattern, no-any-ts

**React:** error-boundary-pattern, zustand-over-redux, redux-state, react-memoization, custom-hooks, file-per-component, explicit-children-type

**CSS:** tailwind-css, css-modules, styled-components, inline-styles-avoid

**Testing:** describe-it-structure, test-setup-hooks, mock-patterns

**General JS:** early-returns, destructuring-params, optional-chaining, and-guards, template-literals, array-methods-over-loops, for-of-loops, nullish-coalescing, object-spread

**Anti-patterns:** async-not-naked (uncaught awaits)

## Strength & Decay

- **EMA merge:** new observations weighted at 15%, history at 85%
- **Decay:** after 14 days without reinforcement, strength fades 5%/day
- Run `/taste decay` periodically to fade stale patterns

## Project Scoping

- Global: `~/.claude/skills/taste/memory/`
- Project override: `<project>/.claude/taste/` (local patterns take priority)
- Language auto-detect: TS/JS, Python, Go, Rust, CSS — patterns filtered to match active project

## Compound Patterns

Detected when 3+ related patterns co-occur at sufficient strength:

| Compound | Members |
|----------|---------|
| `react-optimization-bundle` | memoization + children type + named components |
| `typescript-strict-mode` | strict nulls + type aliases + no-any + explicit returns |
| `modern-js-style` | arrows + optional chaining + nullish coalescing + templates |
| `testing-thorough` | describe/it + setup hooks + mocks |
| `tailwind-ecosystem` | tailwind + named react + arrows |

Run `/taste compound` to detect and write compound patterns.

## Sharing

```bash
/taste push --name my-ts-style     # Export to JSON
/taste pull ./colleague-taste.json # Import from file
/taste pull user/react-style       # Pull from registry
```

## Auto-Injection

On first tool use of a session, `taste-injector.js` writes the top-7 patterns to `~/.claude/skills/taste/cache/active-taste.md`. The model reads this file and follows the conventions.

Injection example:
```
── Taste Profile ──────────────────────────
The user has learned 5 coding preferences:
  [██████████] arrow-functions — 6/8 functions are arrow (1.00)
  [█████████░] optional-chaining — 12 ?. usages vs 2 && guards (0.87)
  [████████░░] no-any-ts — 0 uses of 'any' (0.80)
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
Follow these conventions in generated code unless overridden.
```

## Files

| Path | Purpose |
|------|---------|
| `SKILL.md` | This file |
| `src/taste-extract.js` | Core classifier + memory writer (v2) — 40+ classifiers |
| `src/taste-commands.js` | `/taste` subcommand handler |
| `src/taste-injector.js` | Session-start injection with project lang detection |
| `src/taste-init.js` | One-time setup and health check |
| `src/taste-share.js` | Push/pull profile sharing with verification |
| `src/taste-watch.js` | File watcher for manual edits outside Claude Code |
| `memory/MEMORY.md` | Learned pattern index |
| `memory/{formatting,naming,pattern,anti-pattern}/` | Category directories |
| `memory/compound/` | Cross-file compound patterns |
| `cache/taste-cache.json` | Content-hash dedup cache |
| `cache/active-taste.md` | Live injection (read by model) |
| `cache/session.guard` | One-shot injection guard |
| `exports/` | Exported profile packages |