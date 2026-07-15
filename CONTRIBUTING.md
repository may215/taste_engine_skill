# Contributing

## Adding a Classifier

1. Open `src/taste-extract.js`
2. Add an entry to the `PATTERNS` object:

```js
'my-pattern': {
  category: 'formatting',       // formatting | naming | pattern | anti-pattern
  signal: /regex/,              // Regex that must match the diff for this to run
  detect: (content, filename) => {
    // Return null if pattern not present, or:
    return { pattern: 'my-pattern', strength: 0.8, detail: 'Found 3 occurrences' };
  }
},
```

3. If your classifier can return multiple sub-patterns (e.g. `named` vs `default` exports), add each sub-pattern as a stub entry with `signal: null, detect: () => null` so category lookup works.
4. Run `node src/taste-init.js` to verify.
5. Add the pattern to the classifier table in `README.md`.

### Classifier Guidelines

- **Deterministic only** — No API calls, no LLM calls. Pure regex + counting.
- **Signal gate** — Define a `signal` regex. The engine skips the classifier entirely if the diff doesn't match the signal.
- **Three-observation minimum** — Don't return a pattern unless you've seen at least 2-3 occurrences. Single observations are noise.
- **Confidence scoring** — Strength should be 0.3-1.0. 0.3 = plausible but weak, 0.5 = moderate, 0.7+ = strong preference.
- **Detail strings** — Include counts: "6/8 components named exports" not "prefers named exports".

## Adding a Compound Coupling

Add to the `couplings` array in `detectCompound()`:

```js
{ name: 'my-compound', members: ['pattern-a', 'pattern-b', 'pattern-c'], threshold: 0.4 }
```

## Code Style

- No external dependencies. Vanilla Node.js only.
- No async/await (hooks need to complete in <3 seconds).
- Error-silent in hooks — never throw. Use `console.log` for debug output only.
- Use `const` and `let`, no `var`.
- Use template strings sparingly (Node 18+ supports them but they're slower than concatenation).
- Maximum line length: 100 characters.

## PR Process

1. Open an issue describing what you want to add.
2. Fork the repo.
3. Add your changes.
4. Run `node src/taste-init.js` to verify everything works.
5. Submit a PR with:
   - What the classifier detects
   - Example diff that triggers it
   - False positive rate (estimated)
