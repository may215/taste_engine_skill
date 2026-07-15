# Strength Model

Taste Engine uses an Exponential Moving Average (EMA) for pattern strength, with a time-based decay function for unreinforced patterns.

## EMA Merge

```
strength = old × α + new × (1 - α)
```

Where α = 0.85

### Behavior by Observation Count

| Observation | Raw | Merged | Notes |
|-------------|-----|--------|-------|
| 1st at 0.9 | 0.90 | 0.900 | First obs = full value |
| 2nd at 0.9 | 0.90 | 0.865 | Slight attenuation |
| 3rd at 0.9 | 0.90 | 0.847 | Convergence |
| 4th at 0.9 | 0.90 | 0.835 | |
| 10th at 0.9 | 0.90 | 0.804 | Plateau |
| 1st at 0.9 then 1st at 0.3 | 0.30 | 0.698 | Outlier-resistant |

The 0.85 α means a single divergent observation can't swing strength by more than ~0.15 points, but consistent signal compounds over ~5-8 observations.

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| First observation | strength = raw (no attenuation) |
| Strength resets to 0 | Treated as first observation (use `/taste forget` instead) |
| Conflicting patterns | Both accumulate independently — the divergence is detected by `detectCompound()` |
| Strength > 1.0 | Clamped to 1.0 (shouldn't happen, but safety check in writeMemory) |

## Decay

Decay applies to patterns that haven't been reinforced recently:

```
if daysSinceLastUpdate <= 14: no decay
decay = 1 - 0.05 × (daysSinceLastUpdate - 14)
strength = max(strength × decay, 0.2)
```

### Time Table

| Days Since Update | Multiplier | Starting 0.9 → | Starting 0.5 → |
|-------------------|-----------|-----------------|-----------------|
| 0-14 | 1.00 | 0.90 | 0.50 |
| 15 | 0.95 | 0.86 | 0.48 |
| 20 | 0.70 | 0.63 | 0.35 |
| 25 | 0.45 | 0.41 | 0.23 |
| 30+ | 0.20 | 0.18 (clamped) | 0.20 (clamped) |

### Why 14 Days?

Two-week grace period covers:
- A sprint cycle (typical dev doesn't touch every file every sprint)
- A vacation (patterns shouldn't disappear after a week off)
- A context switch (switching between frontend and backend projects)

After 14 days, the assumption is the pattern is either: (a) so ingrained that you'll reinforce it again naturally, or (b) stale and should fade.

## Compound Pattern Strength

Compound strength is the simple average of member pattern strengths:

```
compoundStrength = avg(member.strengths)
```

This means weak members drag down the compound. The compound won't register until at least 2 members cross the threshold (default 0.4).

## Content-Hash Dedup

Before classification, the engine computes a 32-bit FNV-1a hash of the diff:

```js
function contentHash(text):
    h = 0x811c9dc5
    for each char in text:
        h ^= char_code
        h *= 0x01000193
        h = h >>> 0  // unsigned 32
    return h.toString(16)
```

If the diff hash matches the cached hash for that file, extraction is skipped entirely. This prevents:
- The same edit being analyzed multiple times
- Hooks firing on metadata writes (git, editor temp files)
- Accidental reinforcement from repeating the same change
