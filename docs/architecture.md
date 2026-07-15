# Architecture

## Overview

Taste Engine is a pipe of six independent stages, each with clear input/output boundaries:

```
  File Change ──> [1. Capture] ──> [2. Classify] ──> [3. Merge] ──> [4. Store] ──> [5. Inject] ──> [6. Decay]
                      │                  │               │              │              │              │
                      v                  v               v              v              v              v
                  Hook or          40+ pattern       EMA merge      memory/*.md    active-taste.md   fade stale
                  FileWatcher       classifiers      + dedup                                       patterns
```

Stages 1-4 run synchronously in a PostToolUse hook (<3ms typical). Stage 5 runs once per session. Stage 6 runs on demand via `/taste decay`.

## Stage Details

### Stage 1: Capture

**Input:** File path + diff content (from `$DIFF` env var) + verdict (`--accept`).
**Output:** Content string for classification.

Two capture sources:
1. **PostToolUse hook** — fires after every Write/Edit. Claude Code passes `$FILE` (the written path) and `$DIFF` (the diff text).
2. **File watcher** — `taste-watch.js` uses `fswatch` or `fs.watch` to detect file saves. Passes the full file content.

**Content-hash dedup:** Before passing to classification, the engine computes a 32-bit FNV-1a hash of the diff/content. If the hash matches the last extraction for this file, the entire pipeline is skipped. This prevents re-extraction on unchanged content (e.g., when a hook fires on metadata writes).

### Stage 2: Classification

**Input:** File content + filename.
**Output:** Array of `{pattern, strength, detail}` objects.

Each classifier in the `PATTERNS` object receives the content and filename, and returns either:
- `null` — pattern not detected (threshold not met)
- A result object — pattern detected

Every classifier has a `signal` regex. The engine structure doesn't currently gate on it (it's documented for future optimization), but classifiers are expected to short-circuit fast if their signal isn't present.

**Design constraints:**
- No async operations
- No external dependencies
- Must complete in <1ms per classifier (40 classifiers × 1ms = ~40ms worst case)
- Regex should be anchored where possible (`^`, `gm`) to avoid catastrophic backtracking

### Stage 3: Merge

**Input:** New observation `{pattern, strength, detail}` + existing memory file (if any).
**Output:** Updated strength + source list.

```
function mergeStrength(oldStr, newObs):
    if oldStr === 0: return newObs           // first observation
    return oldStr * 0.85 + newObs * 0.15    // EMA
```

The 0.85/0.15 ratio means:
- 1 observation at 0.9 → 0.90 (full strength)
- 2 observations at 0.9 → 0.86 (slight attenuation)
- 3 observations at 0.9 → 0.85 (convergence)
- 10 observations at 0.9 → 0.80 (stable plateau)
- Divergent signals (0.9 then 0.1) → 0.78 (resistant to outliers)

This prevents both single-hit maxing and oscillation from conflicting patterns.

### Stage 4: Store

**Input:** Classifier result + merged strength.
**Output:** `memory/<category>/<slug>.md` + `MEMORY.md` index update.

Memory files use YAML frontmatter for machine-readability:

```yaml
---
name: error-boundary-pattern
description: "Uses both ErrorBoundary and try/catch"
metadata:
  type: preference
  strength: 0.90
  sources: [src/components/ErrorFallback.tsx]
  lastUpdated: 2026-07-15
---
```

Sources are deduplicated and capped at 10. The `MEMORY.md` index is updated with the correct category-relative path.

### Stage 5: Injection

**Input:** All memory files + project directory for language detection.
**Output:** `cache/active-taste.md` (consumed by the model).

The injector:
1. Walks all memory files (global + project-scoped)
2. Detects project language by scanning file extensions (depth 3)
3. Filters patterns: TS patterns kept for TS projects, filtered for Python etc.
4. Sorts by strength, takes top 7
5. Writes formatted profile to `active-taste.md`
6. Writes session guard to prevent re-injection within the same session

The guard file contains the session ID. On guard check (exit code 0 = already injected), the hook skips.

### Stage 6: Decay

**Input:** Memory files with `lastUpdated` dates.
**Output:** Faded strength values.

```
if daysSinceUpdate <= 14: skip
decayFactor = 1 - 0.05 * (daysSinceUpdate - 14)
strength = strength * decayFactor
```

- Day 14: no decay
- Day 20: 70% of original strength
- Day 30: 20% of original strength
- Day 34+: capped at 20%

After decay, compound patterns are auto-refreshed since underlying strengths may have crossed thresholds.

## Compound Detection

Run via `--compound` flag or automatically during `--decay`.

```
for each compound coupling:
    present_members = members where member.strength > threshold
    if present_members.length >= 2:
        compound.strength = average(present_member.strengths)
        write compound/<name>.md
```

Couplings are stored in `memory/compound/` as separate memory files with `type: compound` in frontmatter. They're loaded by the injector alongside regular patterns.

## Project Scoping

```
function resolveMemoryDir(filePath):
    cwd = process.cwd()
    while cwd !== '/':
        if cwd/.claude/taste/ exists: return cwd/.claude/taste/
        cwd = parent(cwd)
    return global memory dir
```

Project-scoped memories are independent of global ones. Both are loaded by the injector and merged before the top-7 selection.

## Security Model

- All files are local markdown (no network calls)
- Profile sharing uses `curl` for fetch (explicit opt-in per pull)
- No telemetry, no analytics, no phoning home
- No eval, no dynamic require, no code generation
- The injector writes to a known path; the model reads it as context, never executes it