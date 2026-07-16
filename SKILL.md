---
name: taste
description: "Taste engine — learns your coding patterns from accepted/rejected edits and injects them as context in future sessions. 40+ classifiers, diff-aware, compound cross-file detection, profile export/import. Open-source at https://github.com/claude-code/taste-engine"
trigger: /taste
---

# Taste Engine

Learns your coding patterns by observing every Write/Edit. Stores them as structured memory files, injects into session context, supports push/pull sharing.

## Operational Principles

These rules govern how code is generated when following a taste profile. They prevent the most common LLM coding mistakes — overcomplication, speculative abstractions, and silent assumptions — while respecting learned preferences.

### 1. Think Then Generate

Before writing code, quickly check your understanding:

- **State the assumption** — "Using Zustand because taste profile shows zustand-over-redux at 0.80"
- **Surface tradeoffs** — "Arrow functions are preferred (profile: 1.00), but this is a recursive utility — a named function may be clearer. Going with arrow per profile unless it causes issues."
- **When in doubt, ask** — If the task has multiple valid interpretations, present all of them rather than silently choosing one.

The taste profile is guidance, not dogma. If a pattern conflicts with the specific task (e.g., profile says arrow functions but you need recursion), explain the override.

### 2. Generate Taste-Aligned Code

The taste profile in `active-taste.md` (or the platform equivalent) lists the user's top preferences. Follow them:

- If `arrow-functions` is at 0.90: use `const fn = () => {}`, not `function fn() {}`
- If `imports-grouped` is at 0.70: separate imports into type / external / internal groups
- If `no-any-ts` is at 0.80: define proper types instead of using `any`

**Strength-driven application:**

| Profile strength | How to apply |
|----------------|--------------|
| 0.80–1.00 | Always follow. This is a strong, consistent preference. |
| 0.50–0.79 | Follow by default. Override if the alternative is significantly clearer. |
| 0.20–0.49 | Weak signal. Prefer it but don't fight the codebase. |
| Not present | Use conventions from the surrounding code. |

### 3. Simplicity First

The taste profile says *what* to generate, but *how much* to generate is governed by simplicity:

- Generate the minimum code that solves the task
- No speculative abstractions — a one-off pattern doesn't need a utility function
- No speculative flexibility — don't add parameters "for future use"
- No error handling for scenarios that can't happen
- If a block is 4x longer than needed, rewrite it shorter
- Self-check: would a senior engineer call this overcomplicated?

### 4. Surgical Changes

When editing existing code:

- Touch only what the task requires
- Match the existing file's style, even if it conflicts with the taste profile (consistency > preference)
- Do not refactor unrelated code, reformat unmodified blocks, or "fix" comments you weren't asked to
- If your edit creates an orphan (unused import, dead variable), clean it — but only if you created it
- Note pre-existing dead code silently; don't remove it unless asked

**Guiding test:** every changed line should trace directly to the request. If you can't explain why a line changed, revert it.

### 5. Goal-Driven Execution with Verification

Convert tasks into checkpoints that can be verified:

| Task type | Approach |
|-----------|----------|
| Add a function | "Define function, write a quick usage example, confirm it produces expected output" |
| Fix a bug | "Reproduce the bug first, understand root cause, apply fix, confirm fix" |
| Refactor | "Tests pass before → refactor → tests pass after" |
| New feature | "Break into sub-tasks, verify each independently, combine" |

For multi-step work, state a brief plan with checkpoints before starting. When a checkpoint fails, loop — don't plow forward with broken state.

### 6. Taste Profile Override Protocol

Sometimes the profile conflicts with the task. Here's the override hierarchy:

1. **Explicit user instruction** — "Use Redux here" overrides `zustand-over-redux` at any strength
2. **Project convention** — If the file you're editing uses `function` declarations, match that even if profile says arrow functions
3. **Task necessity** — If the approach genuinely requires a different pattern, explain why and proceed
4. **Taste profile** — Default when none of the above apply

When overriding, add a brief note: "Overriding `no-any-ts` because the external API type is unavailable."

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